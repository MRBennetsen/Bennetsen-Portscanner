package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var DefaultInspectPorts = []int{
	21, 22, 23, 25, 53, 80, 110, 135, 139, 143,
	389, 443, 445, 554, 636, 993, 995, 1433, 1883,
	2049, 2375, 2376, 3000, 3306, 3389, 5000, 5432,
	5900, 5985, 5986, 6379, 6443, 8000, 8006, 8080,
	8443, 8888, 9000, 9090, 9100, 27017,
}

type InspectPortDetail struct {
	Port       int    `json:"port"`
	Service    string `json:"service"`
	RTTMs      int64  `json:"rttMs"`
	Banner     string `json:"banner,omitempty"`
	HTTPStatus int    `json:"httpStatus,omitempty"`
	HTTPServer string `json:"httpServer,omitempty"`
	HTTPTitle  string `json:"httpTitle,omitempty"`
	TLSSubject string `json:"tlsSubject,omitempty"`
	TLSIssuer  string `json:"tlsIssuer,omitempty"`
}

type InspectResult struct {
	IP         string              `json:"ip"`
	Hostname   string              `json:"hostname"`
	MAC        string              `json:"mac"`
	Vendor     string              `json:"vendor"`
	OSHint     string              `json:"osHint"`
	DurationMs int64               `json:"durationMs"`
	Ports      []InspectPortDetail `json:"ports"`
}

var (
	titleRegex   = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	spacesRegex  = regexp.MustCompile(`\s+`)
	httpPortSet  = map[int]bool{80: true, 3000: true, 5000: true, 8000: true, 8080: true, 8888: true, 9000: true, 9090: true}
	httpsPortSet = map[int]bool{443: true, 6443: true, 8006: true, 8443: true}
	bannerSet    = map[int]bool{21: true, 22: true, 23: true, 25: true, 110: true, 143: true, 3306: true, 5900: true, 6379: true}
)

func InspectHost(ctx context.Context, ip string, extraPortsSpec string, timeoutMs int) (*InspectResult, error) {
	started := time.Now()
	if net.ParseIP(ip) == nil {
		ips, err := net.LookupIP(ip)
		if err != nil || len(ips) == 0 {
			return nil, fmt.Errorf("invalid target IP/host %q", ip)
		}
		for _, candidate := range ips {
			if ip4 := candidate.To4(); ip4 != nil {
				ip = ip4.String()
				break
			}
		}
	}

	if timeoutMs <= 0 {
		timeoutMs = 1500
	}
	timeout := time.Duration(timeoutMs) * time.Millisecond

	portSet := make(map[int]struct{})
	for _, p := range DefaultInspectPorts {
		portSet[p] = struct{}{}
	}
	if strings.TrimSpace(extraPortsSpec) != "" {
		if extra, err := ParsePorts(extraPortsSpec); err == nil {
			for _, p := range extra {
				portSet[p] = struct{}{}
			}
		}
	}

	ports := make([]int, 0, len(portSet))
	for p := range portSet {
		ports = append(ports, p)
	}
	sort.Ints(ports)

	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		details []InspectPortDetail
	)

	sem := make(chan struct{}, 64)
	for _, port := range ports {
		wg.Add(1)
		go func(p int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			addr := net.JoinHostPort(ip, strconv.Itoa(p))
			t0 := time.Now()
			dialer := net.Dialer{Timeout: timeout}
			conn, err := dialer.DialContext(ctx, "tcp", addr)
			if err != nil {
				return
			}
			rtt := time.Since(t0).Milliseconds()
			if rtt == 0 {
				rtt = 1
			}
			_ = conn.Close()

			detail := InspectPortDetail{
				Port:    p,
				Service: ServiceName(p),
				RTTMs:   rtt,
			}

			if httpsPortSet[p] {
				probeHTTP(ctx, ip, p, true, &detail)
			} else if httpPortSet[p] {
				probeHTTP(ctx, ip, p, false, &detail)
			} else if bannerSet[p] {
				detail.Banner = grabBanner(ctx, ip, p)
			}

			mu.Lock()
			details = append(details, detail)
			mu.Unlock()
		}(port)
	}

	var hostname string
	wg.Add(1)
	go func() {
		defer wg.Done()
		hostname = lookupReverseDNS(ctx, ip)
	}()

	wg.Wait()

	sort.Slice(details, func(i, j int) bool {
		return details[i].Port < details[j].Port
	})

	arp := ReadARPTable()
	mac := arp[ip]
	vendor := ""
	if mac != "" {
		vendor = LookupVendor(mac)
	}

	osHint := inferOSHint(details, vendor)
	if details == nil {
		details = []InspectPortDetail{}
	}

	return &InspectResult{
		IP:         ip,
		Hostname:   hostname,
		MAC:        mac,
		Vendor:     vendor,
		OSHint:     osHint,
		DurationMs: time.Since(started).Milliseconds(),
		Ports:      details,
	}, nil
}

func probeHTTP(ctx context.Context, ip string, port int, useTLS bool, detail *InspectPortDetail) {
	scheme := "http"
	if useTLS {
		scheme = "https"
	}
	targetURL := fmt.Sprintf("%s://%s", scheme, net.JoinHostPort(ip, strconv.Itoa(port)))

	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true, // Local network devices commonly use self-signed certs
		},
		DisableKeepAlives: true,
	}
	defer tr.CloseIdleConnections()

	client := &http.Client{
		Timeout:   2200 * time.Millisecond,
		Transport: tr,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 2 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return
	}
	req.Header.Set("User-Agent", "Bennetsen-Portscanner/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	detail.HTTPStatus = resp.StatusCode
	detail.HTTPServer = strings.TrimSpace(resp.Header.Get("Server"))
	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		cert := resp.TLS.PeerCertificates[0]
		detail.TLSSubject = cert.Subject.CommonName
		detail.TLSIssuer = cert.Issuer.CommonName
	}

	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if m := titleRegex.FindSubmatch(bodyBytes); len(m) > 1 {
		title := spacesRegex.ReplaceAllString(strings.TrimSpace(string(m[1])), " ")
		if len(title) > 120 {
			title = title[:120] + "..."
		}
		detail.HTTPTitle = title
	}
}

func grabBanner(ctx context.Context, ip string, port int) string {
	addr := net.JoinHostPort(ip, strconv.Itoa(port))
	dialer := net.Dialer{Timeout: 1200 * time.Millisecond}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return ""
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(1000 * time.Millisecond))
	if port == 6379 {
		_, _ = conn.Write([]byte("PING\r\n"))
	}

	buf := make([]byte, 512)
	n, _ := conn.Read(buf)
	if n <= 0 {
		return ""
	}

	return sanitizeBanner(buf[:n])
}

func sanitizeBanner(raw []byte) string {
	var b strings.Builder
	lastSpace := false
	for _, c := range raw {
		if c == '\r' || c == '\n' || c == '\t' {
			if !lastSpace && b.Len() > 0 {
				b.WriteByte(' ')
				lastSpace = true
			}
			continue
		}
		if c >= 32 && c <= 126 {
			b.WriteByte(c)
			lastSpace = (c == ' ')
		}
	}
	out := strings.TrimSpace(b.String())
	if len(out) > 220 {
		out = out[:220] + "..."
	}
	return out
}

func inferOSHint(ports []InspectPortDetail, vendor string) string {
	hasPort := make(map[int]bool)
	var combined strings.Builder
	for _, p := range ports {
		hasPort[p.Port] = true
		combined.WriteString(strings.ToLower(p.Banner))
		combined.WriteByte(' ')
		combined.WriteString(strings.ToLower(p.HTTPTitle))
		combined.WriteByte(' ')
		combined.WriteString(strings.ToLower(p.HTTPServer))
		combined.WriteByte(' ')
	}
	text := combined.String()
	lowVendor := strings.ToLower(vendor)

	switch {
	case hasPort[8006] || strings.Contains(text, "proxmox"):
		return "Proxmox VE"
	case strings.Contains(text, "synology") || (strings.Contains(lowVendor, "synology") && (hasPort[5000] || hasPort[5001])):
		return "Synology DSM"
	case strings.Contains(text, "opnsense"):
		return "OPNsense"
	case strings.Contains(text, "pfsense"):
		return "pfSense"
	case strings.Contains(text, "unifi") || strings.Contains(lowVendor, "ubiquiti"):
		return "Ubiquiti / UniFi"
	case strings.Contains(text, "mikrotik") || strings.Contains(lowVendor, "mikrotik"):
		return "MikroTik RouterOS"
	case strings.Contains(text, "ubuntu"):
		return "Ubuntu Linux"
	case strings.Contains(text, "debian"):
		return "Debian Linux"
	case strings.Contains(text, "freebsd"):
		return "FreeBSD"
	case strings.Contains(text, "windows") || (hasPort[3389] && (hasPort[445] || hasPort[135] || hasPort[5985])):
		return "Windows"
	case hasPort[3389]:
		return "Windows (RDP)"
	case strings.Contains(lowVendor, "raspberry pi"):
		return "Raspberry Pi / Linux"
	case strings.Contains(text, "openssh") || hasPort[22]:
		return "Linux / Unix"
	case hasPort[9100]:
		return "Network Printer"
	default:
		return ""
	}
}
