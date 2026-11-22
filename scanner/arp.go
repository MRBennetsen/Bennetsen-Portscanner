package main

import (
	"bufio"
	"bytes"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

func ReadARPTable() map[string]string {
	table := make(map[string]string)

	switch runtime.GOOS {
	case "linux":
		parseProcNetARP(table)
		parseIPNeigh(table)
	case "windows":
		parseArpCommand(table)
	default:
		parseArpCommand(table)
	}

	return table
}

func normalizeMAC(raw string) string {
	clean := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(raw), "-", ":"))
	parts := strings.Split(clean, ":")
	if len(parts) != 6 {
		return ""
	}
	for i, p := range parts {
		if len(p) == 1 {
			parts[i] = "0" + p
		} else if len(p) != 2 {
			return ""
		}
		for _, ch := range parts[i] {
			if !((ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'F')) {
				return ""
			}
		}
	}
	joined := strings.Join(parts, ":")
	if joined == "00:00:00:00:00:00" || joined == "FF:FF:FF:FF:FF:FF" {
		return ""
	}
	return joined
}

func parseProcNetARP(table map[string]string) {
	f, err := os.Open("/proc/net/arp")
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	first := true
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if first {
			first = false
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		ip := fields[0]
		flags := fields[2]
		if flags == "0x0" {
			continue
		}
		if mac := normalizeMAC(fields[3]); mac != "" {
			table[ip] = mac
		}
	}
}

func parseIPNeigh(table map[string]string) {
	out, err := exec.Command("ip", "-4", "neigh", "show").Output()
	if err != nil {
		return
	}
	sc := bufio.NewScanner(bytes.NewReader(out))
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) < 5 {
			continue
		}
		ip := fields[0]
		if net.ParseIP(ip) == nil {
			continue
		}
		for i := 1; i < len(fields)-1; i++ {
			if fields[i] == "lladdr" {
				if mac := normalizeMAC(fields[i+1]); mac != "" {
					if _, exists := table[ip]; !exists {
						table[ip] = mac
					}
				}
				break
			}
		}
	}
}

func parseArpCommand(table map[string]string) {
	out, err := exec.Command("arp", "-a").Output()
	if err != nil {
		return
	}
	sc := bufio.NewScanner(bytes.NewReader(out))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		var foundIP string
		var foundMAC string
		for _, f := range fields {
			clean := strings.Trim(f, "()")
			if foundIP == "" {
				if ip := net.ParseIP(clean); ip != nil && ip.To4() != nil {
					foundIP = ip.To4().String()
					continue
				}
			}
			if foundMAC == "" {
				if mac := normalizeMAC(clean); mac != "" {
					foundMAC = mac
				}
			}
		}
		if foundIP != "" && foundMAC != "" {
			table[foundIP] = foundMAC
		}
	}
}
