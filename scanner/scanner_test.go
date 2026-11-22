package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestParseTargets(t *testing.T) {
	t.Run("CIDR /29 skips network and broadcast", func(t *testing.T) {
		ips, err := ParseTargets("192.168.10.0/29")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(ips) != 6 {
			t.Fatalf("expected 6 host IPs, got %d (%v)", len(ips), ips)
		}
		if ips[0] != "192.168.10.1" || ips[5] != "192.168.10.6" {
			t.Fatalf("unexpected bounds: %v", ips)
		}
	})

	t.Run("Short dash range", func(t *testing.T) {
		ips, err := ParseTargets("10.0.0.10-14")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(ips) != 5 || ips[0] != "10.0.0.10" || ips[4] != "10.0.0.14" {
			t.Fatalf("unexpected range: %v", ips)
		}
	})

	t.Run("Full dash range and deduplication", func(t *testing.T) {
		ips, err := ParseTargets("172.16.1.1-172.16.1.3, 172.16.1.2")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(ips) != 3 {
			t.Fatalf("expected 3 deduplicated IPs, got %d (%v)", len(ips), ips)
		}
	})

	t.Run("Oversized CIDR rejected", func(t *testing.T) {
		if _, err := ParseTargets("10.0.0.0/8"); err == nil {
			t.Fatalf("expected error for /8 subnet")
		}
	})
}

func TestParsePorts(t *testing.T) {
	ports, err := ParsePorts("443, 22, 8000-8002, 22")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []int{22, 443, 8000, 8001, 8002}
	if len(ports) != len(want) {
		t.Fatalf("got %v, want %v", ports, want)
	}
	for i := range want {
		if ports[i] != want[i] {
			t.Fatalf("got %v, want %v", ports, want)
		}
	}

	if _, err := ParsePorts("70000"); err == nil {
		t.Fatalf("expected error for out-of-range port")
	}
}

func TestLookupVendor(t *testing.T) {
	if got := LookupVendor("74-83-c2-11-22-33"); got != "Ubiquiti" {
		t.Fatalf("expected Ubiquiti, got %q", got)
	}
	if got := LookupVendor("B8:27:EB:AA:BB:CC"); got != "Raspberry Pi" {
		t.Fatalf("expected Raspberry Pi, got %q", got)
	}
	if got := LookupVendor("02:11:22:33:44:55"); got != "" {
		t.Fatalf("expected empty vendor, got %q", got)
	}
}

func TestScanAndInspectLocalhost(t *testing.T) {
	// 1. Ephemeral banner server simulating SSH
	bannerLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen banner: %v", err)
	}
	defer bannerLn.Close()
	go func() {
		for {
			c, err := bannerLn.Accept()
			if err != nil {
				return
			}
			_, _ = c.Write([]byte("SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13\r\n"))
			_ = c.Close()
		}
	}()
	bannerPort := bannerLn.Addr().(*net.TCPAddr).Port

	// 2. Ephemeral HTTP server with <title>
	httpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Server", "BennetsenTestHTTP")
		_, _ = w.Write([]byte("<html><head><title>Gateway Admin</title></head><body>OK</body></html>"))
	}))
	defer httpSrv.Close()
	parsedURL, _ := url.Parse(httpSrv.URL)
	httpPort, _ := strconv.Atoi(parsedURL.Port())

	// 3. Run Scan against localhost on both open ports + a likely closed port
	var buf bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	portSpec := fmt.Sprintf("%d,%d", bannerPort, httpPort)
	err = RunScan(ctx, ScanConfig{
		TargetsSpec: "127.0.0.1",
		PortsSpec:   portSpec,
		Concurrency: 16,
		TimeoutMs:   500,
		ResolveDNS:  false,
	}, &buf)
	if err != nil {
		t.Fatalf("RunScan failed: %v", err)
	}

	var finalizedHost *HostResult
	var sawDone bool
	sc := bufio.NewScanner(&buf)
	for sc.Scan() {
		var ev ScanEvent
		if err := json.Unmarshal(sc.Bytes(), &ev); err != nil {
			t.Fatalf("invalid event JSON: %v", err)
		}
		if ev.Type == "host" && ev.Host != nil && ev.Host.Finalized {
			finalizedHost = ev.Host
		}
		if ev.Type == "done" {
			sawDone = true
		}
	}
	if !sawDone {
		t.Fatalf("did not receive done event")
	}
	if finalizedHost == nil || len(finalizedHost.Ports) != 2 {
		t.Fatalf("expected 2 open ports on finalized host, got %+v", finalizedHost)
	}

	// 4. Test InspectHost picks up extra port and HTTP probe helper
	res, err := InspectHost(ctx, "127.0.0.1", portSpec, 500)
	if err != nil {
		t.Fatalf("InspectHost failed: %v", err)
	}
	foundBannerPort := false
	foundHTTPPort := false
	for _, p := range res.Ports {
		if p.Port == bannerPort {
			foundBannerPort = true
		}
		if p.Port == httpPort {
			foundHTTPPort = true
		}
	}
	if !foundBannerPort || !foundHTTPPort {
		t.Fatalf("expected both ephemeral ports in InspectResult, got %+v", res.Ports)
	}

	// Also verify HTTP probe directly extracts title and Server header
	httpDetail := InspectPortDetail{Port: httpPort}
	probeHTTP(ctx, "127.0.0.1", httpPort, false, &httpDetail)
	if httpDetail.HTTPTitle != "Gateway Admin" || httpDetail.HTTPServer != "BennetsenTestHTTP" {
		t.Fatalf("unexpected HTTP probe result: %+v", httpDetail)
	}
	if got := grabBanner(ctx, "127.0.0.1", bannerPort); !strings.Contains(got, "OpenSSH_9.6p1 Ubuntu") {
		t.Fatalf("unexpected grabbed banner: %q", got)
	}
}

func TestICMPPingLocalhost(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	alive, rtt := pingHost(ctx, "127.0.0.1", 500)
	if !alive {
		t.Fatalf("expected 127.0.0.1 to respond to ICMP ping")
	}
	if rtt <= 0 {
		t.Fatalf("expected positive RTT, got %d", rtt)
	}
}

func TestRunScanWithICMPAndARPFlags(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close() // closed port so TCP check fails/RSTs; ICMP still discovers if TCP didn't

	var buf bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	err = RunScan(ctx, ScanConfig{
		TargetsSpec:  "127.0.0.1",
		PortsSpec:    strconv.Itoa(port),
		Concurrency:  4,
		TimeoutMs:    300,
		ResolveDNS:   false,
		ICMPPing:     true,
		ARPDiscovery: true,
	}, &buf)
	if err != nil {
		t.Fatalf("RunScan with ICMP/ARP failed: %v", err)
	}

	var sawHost bool
	var sawDone bool
	sc := bufio.NewScanner(&buf)
	for sc.Scan() {
		var ev ScanEvent
		if err := json.Unmarshal(sc.Bytes(), &ev); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		if ev.Type == "host" && ev.Host != nil && ev.Host.IP == "127.0.0.1" {
			sawHost = true
		}
		if ev.Type == "done" {
			sawDone = true
		}
	}
	if !sawHost || !sawDone {
		t.Fatalf("expected host and done events, got sawHost=%v sawDone=%v", sawHost, sawDone)
	}
}
