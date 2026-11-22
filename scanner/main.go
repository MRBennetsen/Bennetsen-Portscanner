package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: portscanner <interfaces|scan|inspect> [flags]")
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	sub := os.Args[1]
	switch sub {
	case "interfaces":
		ifaces, err := ListInterfaces()
		if err != nil {
			fmt.Fprintf(os.Stderr, "error listing interfaces: %v\n", err)
			os.Exit(1)
		}
		if ifaces == nil {
			ifaces = []NetworkInterface{}
		}
		enc := json.NewEncoder(os.Stdout)
		_ = enc.Encode(ifaces)

	case "scan":
		fs := flag.NewFlagSet("scan", flag.ExitOnError)
		targets := fs.String("targets", "", "target IP, CIDR, or range")
		ports := fs.String("ports", "22,80,443,445,3389", "port list or ranges")
		concurrency := fs.Int("concurrency", 1500, "max concurrent workers")
		timeout := fs.Int("timeout", 600, "connect timeout in ms")
		rdns := fs.Bool("rdns", true, "resolve reverse DNS")
		icmp := fs.Bool("icmp", false, "enable opt-in ICMP ping sweep for silent hosts")
		arp := fs.Bool("arp", false, "enable opt-in ARP table discovery for silent LAN hosts")
		_ = fs.Parse(os.Args[2:])

		if err := RunScan(ctx, ScanConfig{
			TargetsSpec:  *targets,
			PortsSpec:    *ports,
			Concurrency:  *concurrency,
			TimeoutMs:    *timeout,
			ResolveDNS:   *rdns,
			ICMPPing:     *icmp,
			ARPDiscovery: *arp,
		}, os.Stdout); err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(ScanEvent{
				Type:    "error",
				Message: err.Error(),
			})
			os.Exit(1)
		}

	case "inspect":
		fs := flag.NewFlagSet("inspect", flag.ExitOnError)
		ip := fs.String("ip", "", "target host IP")
		ports := fs.String("ports", "", "extra ports to probe")
		timeout := fs.Int("timeout", 1500, "connect timeout in ms")
		_ = fs.Parse(os.Args[2:])

		if *ip == "" {
			fmt.Fprintln(os.Stderr, "--ip is required")
			os.Exit(1)
		}
		res, err := InspectHost(ctx, *ip, *ports, *timeout)
		if err != nil {
			fmt.Fprintf(os.Stderr, "inspect error: %v\n", err)
			os.Exit(1)
		}
		_ = json.NewEncoder(os.Stdout).Encode(res)

	default:
		fmt.Fprintf(os.Stderr, "unknown subcommand %q\n", sub)
		os.Exit(1)
	}
}
