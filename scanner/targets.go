package main

import (
	"encoding/binary"
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
)

const maxExpandedHosts = 262144 // /14 max to prevent accidental full internet exhaustion

func ipToUint32(ip net.IP) (uint32, bool) {
	ip4 := ip.To4()
	if ip4 == nil {
		return 0, false
	}
	return binary.BigEndian.Uint32(ip4), true
}

func uint32ToIP(n uint32) string {
	var b [4]byte
	binary.BigEndian.PutUint32(b[:], n)
	return net.IP(b[:]).String()
}

func ParseTargets(spec string) ([]string, error) {
	trimmed := strings.TrimSpace(spec)
	if trimmed == "" {
		return nil, fmt.Errorf("empty target specification")
	}

	rawTokens := strings.FieldsFunc(trimmed, func(r rune) bool {
		return r == ',' || r == ';' || r == '\n' || r == '\r'
	})

	seen := make(map[string]struct{})
	var targets []string
	addTarget := func(ip string) error {
		if len(targets) >= maxExpandedHosts {
			return fmt.Errorf("target scope exceeds maximum limit of %d hosts", maxExpandedHosts)
		}
		if _, ok := seen[ip]; !ok {
			seen[ip] = struct{}{}
			targets = append(targets, ip)
		}
		return nil
	}

	for _, tok := range rawTokens {
		part := strings.TrimSpace(tok)
		if part == "" {
			continue
		}

		switch {
		case strings.Contains(part, "/"):
			_, ipNet, err := net.ParseCIDR(part)
			if err != nil {
				return nil, fmt.Errorf("invalid CIDR %q: %w", part, err)
			}
			ones, bits := ipNet.Mask.Size()
			if bits != 32 {
				return nil, fmt.Errorf("only IPv4 CIDR is supported: %q", part)
			}
			hostBits := 32 - ones
			if hostBits > 18 {
				return nil, fmt.Errorf("CIDR %q is too large (%d+ hosts); maximum supported prefix is /14", part, 1<<18)
			}
			netNum, ok := ipToUint32(ipNet.IP.Mask(ipNet.Mask))
			if !ok {
				return nil, fmt.Errorf("invalid IPv4 CIDR %q", part)
			}
			total := uint32(1) << uint(hostBits)
			if ones == 32 {
				if err := addTarget(uint32ToIP(netNum)); err != nil {
					return nil, err
				}
			} else if ones == 31 {
				for i := uint32(0); i < 2; i++ {
					if err := addTarget(uint32ToIP(netNum + i)); err != nil {
						return nil, err
					}
				}
			} else {
				for i := uint32(1); i < total-1; i++ {
					if err := addTarget(uint32ToIP(netNum + i)); err != nil {
						return nil, err
					}
				}
			}

		case strings.Contains(part, "-"):
			pieces := strings.SplitN(part, "-", 2)
			left := strings.TrimSpace(pieces[0])
			right := strings.TrimSpace(pieces[1])
			startIP := net.ParseIP(left)
			if startIP == nil || startIP.To4() == nil {
				// Could be a hostname containing a hyphen
				if addErr := resolveHostnameOrErr(part, addTarget); addErr != nil {
					return nil, addErr
				}
				continue
			}
			startNum, _ := ipToUint32(startIP)
			var endNum uint32

			if endIP := net.ParseIP(right); endIP != nil && endIP.To4() != nil {
				endNum, _ = ipToUint32(endIP)
			} else if endOctet, err := strconv.Atoi(right); err == nil && endOctet >= 0 && endOctet <= 255 {
				ip4 := startIP.To4()
				endNum = (uint32(ip4[0]) << 24) | (uint32(ip4[1]) << 16) | (uint32(ip4[2]) << 8) | uint32(endOctet)
			} else {
				return nil, fmt.Errorf("invalid IP range %q", part)
			}

			if endNum < startNum {
				startNum, endNum = endNum, startNum
			}
			if uint64(endNum-startNum)+1 > maxExpandedHosts {
				return nil, fmt.Errorf("range %q exceeds %d hosts", part, maxExpandedHosts)
			}
			for n := startNum; n <= endNum; n++ {
				if err := addTarget(uint32ToIP(n)); err != nil {
					return nil, err
				}
				if n == ^uint32(0) {
					break
				}
			}

		default:
			if ip := net.ParseIP(part); ip != nil && ip.To4() != nil {
				if err := addTarget(ip.To4().String()); err != nil {
					return nil, err
				}
			} else {
				if err := resolveHostnameOrErr(part, addTarget); err != nil {
					return nil, err
				}
			}
		}
	}

	if len(targets) == 0 {
		return nil, fmt.Errorf("no valid targets parsed from %q", spec)
	}
	return targets, nil
}

func resolveHostnameOrErr(host string, addTarget func(string) error) error {
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("cannot resolve target %q: %w", host, err)
	}
	for _, ip := range ips {
		if ip4 := ip.To4(); ip4 != nil {
			return addTarget(ip4.String())
		}
	}
	return fmt.Errorf("target %q has no IPv4 address", host)
}

func ParsePorts(spec string) ([]int, error) {
	trimmed := strings.TrimSpace(spec)
	if trimmed == "" {
		return nil, fmt.Errorf("empty port specification")
	}

	seen := make(map[int]struct{})
	var ports []int

	tokens := strings.FieldsFunc(trimmed, func(r rune) bool {
		return r == ',' || r == ';' || r == ' '
	})

	for _, tok := range tokens {
		part := strings.TrimSpace(tok)
		if part == "" {
			continue
		}
		if strings.Contains(part, "-") {
			bounds := strings.SplitN(part, "-", 2)
			start, err1 := strconv.Atoi(strings.TrimSpace(bounds[0]))
			end, err2 := strconv.Atoi(strings.TrimSpace(bounds[1]))
			if err1 != nil || err2 != nil {
				return nil, fmt.Errorf("invalid port range %q", part)
			}
			if start > end {
				start, end = end, start
			}
			if start < 1 || end > 65535 {
				return nil, fmt.Errorf("port range %q out of bounds (1-65535)", part)
			}
			for p := start; p <= end; p++ {
				if _, ok := seen[p]; !ok {
					seen[p] = struct{}{}
					ports = append(ports, p)
				}
			}
		} else {
			p, err := strconv.Atoi(part)
			if err != nil || p < 1 || p > 65535 {
				return nil, fmt.Errorf("invalid port %q", part)
			}
			if _, ok := seen[p]; !ok {
				seen[p] = struct{}{}
				ports = append(ports, p)
			}
		}
	}

	if len(ports) == 0 {
		return nil, fmt.Errorf("no valid ports parsed from %q", spec)
	}

	sort.Ints(ports)
	return ports, nil
}

var wellKnownServices = map[int]string{
	21:    "FTP",
	22:    "SSH",
	23:    "Telnet",
	25:    "SMTP",
	53:    "DNS",
	80:    "HTTP",
	110:   "POP3",
	111:   "RPCBind",
	123:   "NTP",
	135:   "MSRPC",
	139:   "NetBIOS",
	143:   "IMAP",
	161:   "SNMP",
	389:   "LDAP",
	443:   "HTTPS",
	445:   "SMB",
	465:   "SMTPS",
	514:   "Syslog",
	554:   "RTSP",
	587:   "SMTP-Sub",
	636:   "LDAPS",
	993:   "IMAPS",
	995:   "POP3S",
	1433:  "MSSQL",
	1521:  "Oracle",
	1883:  "MQTT",
	2049:  "NFS",
	2375:  "Docker",
	2376:  "Docker-TLS",
	3000:  "HTTP-Alt",
	3306:  "MySQL",
	3389:  "RDP",
	5000:  "HTTP-Alt",
	5432:  "PostgreSQL",
	5900:  "VNC",
	5985:  "WinRM",
	5986:  "WinRM-TLS",
	6379:  "Redis",
	6443:  "Kubernetes",
	8000:  "HTTP-Alt",
	8006:  "Proxmox",
	8080:  "HTTP-Proxy",
	8443:  "HTTPS-Alt",
	8888:  "HTTP-Alt",
	9000:  "Web-Admin",
	9090:  "Cockpit",
	9100:  "JetDirect",
	27017: "MongoDB",
}

func ServiceName(port int) string {
	if s, ok := wellKnownServices[port]; ok {
		return s
	}
	return fmt.Sprintf("TCP/%d", port)
}
