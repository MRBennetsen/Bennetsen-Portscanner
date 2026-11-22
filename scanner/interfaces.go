package main

import (
	"fmt"
	"net"
	"sort"
	"strings"
)

type NetworkInterface struct {
	Name        string `json:"name"`
	IP          string `json:"ip"`
	Mask        string `json:"mask"`
	CIDR        string `json:"cidr"`
	NetworkCIDR string `json:"networkCidr"`
	PrefixLen   int    `json:"prefixLen"`
	HostCount   int    `json:"hostCount"`
	IsUp        bool   `json:"isUp"`
}

func ListInterfaces() ([]NetworkInterface, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	var result []NetworkInterface
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		isUp := iface.Flags&net.FlagUp != 0
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok {
				continue
			}
			ip4 := ipNet.IP.To4()
			if ip4 == nil || ip4.IsLoopback() || ip4.IsLinkLocalUnicast() {
				continue
			}

			ones, bits := ipNet.Mask.Size()
			if bits != 32 {
				continue
			}

			netIP := ip4.Mask(ipNet.Mask)
			hostCount := 1
			if ones <= 30 {
				hostCount = (1 << uint(32-ones)) - 2
			} else if ones == 31 {
				hostCount = 2
			}

			maskStr := net.IP(ipNet.Mask).String()
			result = append(result, NetworkInterface{
				Name:        iface.Name,
				IP:          ip4.String(),
				Mask:        maskStr,
				CIDR:        fmt.Sprintf("%s/%d", ip4.String(), ones),
				NetworkCIDR: fmt.Sprintf("%s/%d", netIP.String(), ones),
				PrefixLen:   ones,
				HostCount:   hostCount,
				IsUp:        isUp,
			})
		}
	}

	sort.SliceStable(result, func(i, j int) bool {
		if result[i].IsUp != result[j].IsUp {
			return result[i].IsUp
		}
		vi := isVirtualInterfaceName(result[i].Name)
		vj := isVirtualInterfaceName(result[j].Name)
		if vi != vj {
			return !vi
		}
		return result[i].Name < result[j].Name
	})

	return result, nil
}

func isVirtualInterfaceName(name string) bool {
	low := strings.ToLower(name)
	virtualPrefixes := []string{"docker", "br-", "veth", "virbr", "vmnet", "vbox", "tun", "tap", "tailscale", "wg"}
	for _, p := range virtualPrefixes {
		if strings.HasPrefix(low, p) || strings.Contains(low, "wsl") || strings.Contains(low, "hyper-v") {
			return true
		}
	}
	return false
}
