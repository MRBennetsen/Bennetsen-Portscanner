package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

type ScanConfig struct {
	TargetsSpec  string
	PortsSpec    string
	Concurrency  int
	TimeoutMs    int
	ResolveDNS   bool
	ICMPPing     bool
	ARPDiscovery bool
}

type PortInfo struct {
	Port    int    `json:"port"`
	Service string `json:"service"`
	RTTMs   int64  `json:"rttMs"`
}

type HostResult struct {
	IP        string     `json:"ip"`
	Hostname  string     `json:"hostname"`
	MAC       string     `json:"mac"`
	Vendor    string     `json:"vendor"`
	RTTMs     int64      `json:"rttMs"`
	Alive     bool       `json:"alive"`
	Ports     []PortInfo `json:"ports"`
	Finalized bool       `json:"finalized"`
}

type ScanEvent struct {
	Type         string      `json:"type"`
	TotalTargets int         `json:"totalTargets,omitempty"`
	TotalChecks  int         `json:"totalChecks,omitempty"`
	Completed    int64       `json:"completed,omitempty"`
	Total        int         `json:"total,omitempty"`
	HostsUp      int64       `json:"hostsUp,omitempty"`
	OpenPorts    int64       `json:"openPorts,omitempty"`
	DurationMs   int64       `json:"durationMs,omitempty"`
	Host         *HostResult `json:"host,omitempty"`
	Message      string      `json:"message,omitempty"`
}

type scanJob struct {
	hostIdx int
	ip      string
	port    int
}

type hostAccumulator struct {
	mu        sync.Mutex
	ip        string
	ports     []PortInfo
	minRTT    int64
	sawRST    bool
	remaining int32
	emitted   bool
}

type arpCache struct {
	mu          sync.Mutex
	table       map[string]string
	lastRefresh time.Time
}

func (c *arpCache) lookup(ip string, forceRefresh bool) (string, string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if forceRefresh || c.table == nil || time.Since(c.lastRefresh) > 350*time.Millisecond {
		c.table = ReadARPTable()
		c.lastRefresh = time.Now()
	}
	mac := c.table[ip]
	if mac == "" {
		return "", ""
	}
	return mac, LookupVendor(mac)
}

func isConnectionRefused(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, syscall.ECONNREFUSED) {
		return true
	}
	low := strings.ToLower(err.Error())
	return strings.Contains(low, "refused")
}

func RunScan(ctx context.Context, cfg ScanConfig, out io.Writer) error {
	runtime.GOMAXPROCS(runtime.NumCPU())
	raiseFileLimit()

	targets, err := ParseTargets(cfg.TargetsSpec)
	if err != nil {
		return err
	}
	ports, err := ParsePorts(cfg.PortsSpec)
	if err != nil {
		return err
	}

	concurrency := cfg.Concurrency
	if concurrency <= 0 {
		concurrency = 1500
	}
	if concurrency > 10000 {
		concurrency = 10000
	}
	timeoutMs := cfg.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = 600
	}
	timeout := time.Duration(timeoutMs) * time.Millisecond

	totalChecks := len(targets) * len(ports)
	if concurrency > totalChecks {
		concurrency = totalChecks
	}

	var encMu sync.Mutex
	enc := json.NewEncoder(out)
	emit := func(ev ScanEvent) {
		encMu.Lock()
		_ = enc.Encode(ev)
		encMu.Unlock()
	}

	started := time.Now()
	emit(ScanEvent{
		Type:         "start",
		TotalTargets: len(targets),
		TotalChecks:  totalChecks,
	})

	hosts := make([]hostAccumulator, len(targets))
	portCount := int32(len(ports))
	for i, ip := range targets {
		hosts[i] = hostAccumulator{
			ip:        ip,
			minRTT:    -1,
			remaining: portCount,
		}
	}

	var completed atomic.Int64
	var hostsUp atomic.Int64
	var openPorts atomic.Int64

	arp := &arpCache{}
	rdnsSem := make(chan struct{}, 128)
	var enrichWG sync.WaitGroup
	var finalHostsMu sync.Mutex
	finalHosts := make([]*HostResult, 0, 64)

	jobs := make(chan scanJob, minInt(concurrency*2, 16384))

	// Progress ticker
	progressDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-progressDone:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				emit(ScanEvent{
					Type:      "progress",
					Completed: completed.Load(),
					Total:     totalChecks,
					HostsUp:   hostsUp.Load(),
					OpenPorts: openPorts.Load(),
				})
			}
		}
	}()

	var workerWG sync.WaitGroup
	for w := 0; w < concurrency; w++ {
		workerWG.Add(1)
		go func() {
			defer workerWG.Done()
			for job := range jobs {
				if ctx.Err() != nil {
					return
				}
				addr := net.JoinHostPort(job.ip, strconv.Itoa(job.port))
				t0 := time.Now()
				dialer := net.Dialer{Timeout: timeout}
				conn, dialErr := dialer.DialContext(ctx, "tcp", addr)
				rtt := time.Since(t0).Milliseconds()
				if rtt == 0 {
					rtt = 1
				}

				h := &hosts[job.hostIdx]
				var emitInitial *HostResult
				var finalizeHost *HostResult

				if dialErr == nil {
					_ = conn.Close()
					openPorts.Add(1)

					h.mu.Lock()
					h.ports = append(h.ports, PortInfo{
						Port:    job.port,
						Service: ServiceName(job.port),
						RTTMs:   rtt,
					})
					if h.minRTT < 0 || rtt < h.minRTT {
						h.minRTT = rtt
					}
					if !h.emitted {
						h.emitted = true
						hostsUp.Add(1)
						portsCopy := append([]PortInfo(nil), h.ports...)
						emitInitial = &HostResult{
							IP:        h.ip,
							RTTMs:     h.minRTT,
							Alive:     true,
							Ports:     portsCopy,
							Finalized: false,
						}
					}
					h.remaining--
					rem := h.remaining
					if rem == 0 {
						sort.Slice(h.ports, func(i, j int) bool {
							return h.ports[i].Port < h.ports[j].Port
						})
						portsCopy := append([]PortInfo(nil), h.ports...)
						finalizeHost = &HostResult{
							IP:        h.ip,
							RTTMs:     h.minRTT,
							Alive:     true,
							Ports:     portsCopy,
							Finalized: true,
						}
					}
					h.mu.Unlock()
				} else {
					refused := isConnectionRefused(dialErr)
					h.mu.Lock()
					if refused {
						h.sawRST = true
						if h.minRTT < 0 || rtt < h.minRTT {
							h.minRTT = rtt
						}
					}
					h.remaining--
					rem := h.remaining
					if rem == 0 && (len(h.ports) > 0 || h.sawRST) {
						if !h.emitted {
							h.emitted = true
							hostsUp.Add(1)
						}
						sort.Slice(h.ports, func(i, j int) bool {
							return h.ports[i].Port < h.ports[j].Port
						})
						portsCopy := append([]PortInfo(nil), h.ports...)
						if portsCopy == nil {
							portsCopy = []PortInfo{}
						}
						finalizeHost = &HostResult{
							IP:        h.ip,
							RTTMs:     h.minRTT,
							Alive:     true,
							Ports:     portsCopy,
							Finalized: true,
						}
					}
					h.mu.Unlock()
				}

				if emitInitial != nil && finalizeHost == nil {
					emit(ScanEvent{
						Type: "host",
						Host: emitInitial,
					})
				}

				if finalizeHost != nil {
					enrichWG.Add(1)
					go func(hr *HostResult) {
						defer enrichWG.Done()
						if cfg.ResolveDNS && ctx.Err() == nil {
							rdnsSem <- struct{}{}
							hr.Hostname = lookupReverseDNS(ctx, hr.IP)
							<-rdnsSem
						}
						hr.MAC, hr.Vendor = arp.lookup(hr.IP, false)

						finalHostsMu.Lock()
						finalHosts = append(finalHosts, hr)
						finalHostsMu.Unlock()

						emit(ScanEvent{
							Type: "host",
							Host: hr,
						})
					}(finalizeHost)
				}

				completed.Add(1)
			}
		}()
	}

	// Enqueue jobs port-by-port across targets so traffic is spread cleanly across hosts
enqueueLoop:
	for _, port := range ports {
		for idx, ip := range targets {
			select {
			case <-ctx.Done():
				break enqueueLoop
			case jobs <- scanJob{hostIdx: idx, ip: ip, port: port}:
			}
		}
	}
	close(jobs)

	workerWG.Wait()
	enrichWG.Wait()
	close(progressDone)

	// Final ARP table refresh for any discovered host missing a MAC address
	if ctx.Err() == nil && len(finalHosts) > 0 {
		freshARP := ReadARPTable()
		for _, hr := range finalHosts {
			if hr.MAC == "" {
				if mac := freshARP[hr.IP]; mac != "" {
					hr.MAC = mac
					hr.Vendor = LookupVendor(mac)
					emit(ScanEvent{
						Type: "host",
						Host: hr,
					})
				}
			}
		}
	}

	// Optional silent-host discovery (opt-in ICMP ping sweep & OS ARP table check)
	if ctx.Err() == nil && (cfg.ICMPPing || cfg.ARPDiscovery) {
		var discoveredMu sync.Mutex
		discovered := make(map[string]bool, len(finalHosts))
		for _, hr := range finalHosts {
			discovered[hr.IP] = true
		}

		if cfg.ICMPPing {
			useRaw := canUseRawICMP()
			var remaining []string
			for _, ip := range targets {
				if !discovered[ip] {
					remaining = append(remaining, ip)
				}
			}

			if len(remaining) > 0 {
				icmpWorkers := minInt(concurrency, 256)
				if useRaw {
					icmpWorkers = minInt(concurrency, 1000)
				}
				if icmpWorkers > len(remaining) {
					icmpWorkers = len(remaining)
				}

				icmpJobs := make(chan string, len(remaining))
				for _, ip := range remaining {
					icmpJobs <- ip
				}
				close(icmpJobs)

				var icmpWG sync.WaitGroup
				for w := 0; w < icmpWorkers; w++ {
					icmpWG.Add(1)
					go func() {
						defer icmpWG.Done()
						for ip := range icmpJobs {
							if ctx.Err() != nil {
								return
							}
							if alive, rtt := pingHostWithMode(ctx, ip, timeoutMs, useRaw); alive {
								discoveredMu.Lock()
								already := discovered[ip]
								if !already {
									discovered[ip] = true
								}
								discoveredMu.Unlock()
								if already {
									continue
								}

								hostsUp.Add(1)
								var hostname string
								if cfg.ResolveDNS {
									rdnsSem <- struct{}{}
									hostname = lookupReverseDNS(ctx, ip)
									<-rdnsSem
								}
								mac, vendor := arp.lookup(ip, false)
								hr := &HostResult{
									IP:        ip,
									Hostname:  hostname,
									MAC:       mac,
									Vendor:    vendor,
									RTTMs:     rtt,
									Alive:     true,
									Ports:     []PortInfo{},
									Finalized: true,
								}
								finalHostsMu.Lock()
								finalHosts = append(finalHosts, hr)
								finalHostsMu.Unlock()
								emit(ScanEvent{
									Type: "host",
									Host: hr,
								})
							}
						}
					}()
				}
				icmpWG.Wait()
			}
		}

		if cfg.ARPDiscovery && ctx.Err() == nil {
			freshARP := ReadARPTable()
			var arpWG sync.WaitGroup
			for _, ip := range targets {
				discoveredMu.Lock()
				already := discovered[ip]
				mac := freshARP[ip]
				if !already && mac != "" {
					discovered[ip] = true
				}
				discoveredMu.Unlock()

				if already || mac == "" {
					continue
				}

				hostsUp.Add(1)
				arpWG.Add(1)
				go func(targetIP, targetMAC string) {
					defer arpWG.Done()
					var hostname string
					if cfg.ResolveDNS && ctx.Err() == nil {
						rdnsSem <- struct{}{}
						hostname = lookupReverseDNS(ctx, targetIP)
						<-rdnsSem
					}
					hr := &HostResult{
						IP:        targetIP,
						Hostname:  hostname,
						MAC:       targetMAC,
						Vendor:    LookupVendor(targetMAC),
						RTTMs:     0,
						Alive:     true,
						Ports:     []PortInfo{},
						Finalized: true,
					}
					finalHostsMu.Lock()
					finalHosts = append(finalHosts, hr)
					finalHostsMu.Unlock()
					emit(ScanEvent{
						Type: "host",
						Host: hr,
					})
				}(ip, mac)
			}
			arpWG.Wait()
		}
	}

	emit(ScanEvent{
		Type:       "done",
		DurationMs: time.Since(started).Milliseconds(),
		Completed:  completed.Load(),
		Total:      totalChecks,
		HostsUp:    hostsUp.Load(),
		OpenPorts:  openPorts.Load(),
	})

	if ctx.Err() != nil {
		return fmt.Errorf("scan cancelled")
	}
	return nil
}

func lookupReverseDNS(parent context.Context, ip string) string {
	ctx, cancel := context.WithTimeout(parent, 600*time.Millisecond)
	defer cancel()
	names, err := net.DefaultResolver.LookupAddr(ctx, ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	return strings.TrimSuffix(names[0], ".")
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
