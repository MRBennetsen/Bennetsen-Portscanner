package main

import (
	"context"
	"encoding/binary"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"sync/atomic"
	"time"
)

var icmpSeqCounter atomic.Uint32

func canUseRawICMP() bool {
	conn, err := net.ListenPacket("ip4:icmp", "0.0.0.0")
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func pingHost(ctx context.Context, ip string, timeoutMs int) (bool, int64) {
	seq := uint16(icmpSeqCounter.Add(1))
	if canUseRawICMP() {
		if ok, rtt := pingHostRaw(ctx, ip, uint16(os.Getpid()&0xffff), seq, timeoutMs); ok {
			return true, rtt
		}
	}
	return pingHostOS(ctx, ip, timeoutMs)
}

func pingHostWithMode(ctx context.Context, ip string, timeoutMs int, useRaw bool) (bool, int64) {
	if useRaw {
		seq := uint16(icmpSeqCounter.Add(1))
		return pingHostRaw(ctx, ip, uint16(os.Getpid()&0xffff), seq, timeoutMs)
	}
	return pingHostOS(ctx, ip, timeoutMs)
}

func pingHostRaw(ctx context.Context, ip string, id uint16, seq uint16, timeoutMs int) (bool, int64) {
	if timeoutMs <= 0 {
		timeoutMs = 600
	}
	timeout := time.Duration(timeoutMs) * time.Millisecond

	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "ip4:icmp", ip)
	if err != nil {
		return false, 0
	}
	defer conn.Close()

	pkt := buildICMPEchoRequest(id, seq)
	t0 := time.Now()
	_ = conn.SetDeadline(t0.Add(timeout))

	if _, err := conn.Write(pkt); err != nil {
		return false, 0
	}

	buf := make([]byte, 512)
	for {
		n, err := conn.Read(buf)
		if err != nil {
			return false, 0
		}
		payload := buf[:n]
		// Raw IPv4 sockets on Linux/Windows return the IPv4 header before the ICMP payload.
		if len(payload) >= 20 && (payload[0]>>4) == 4 {
			ihl := int(payload[0]&0x0f) * 4
			if ihl >= 20 && ihl <= len(payload) {
				payload = payload[ihl:]
			}
		}
		if len(payload) >= 8 && payload[0] == 0 && payload[1] == 0 {
			replyID := binary.BigEndian.Uint16(payload[4:6])
			replySeq := binary.BigEndian.Uint16(payload[6:8])
			if replyID == id && replySeq == seq {
				rtt := time.Since(t0).Milliseconds()
				if rtt == 0 {
					rtt = 1
				}
				return true, rtt
			}
		}
	}
}

func buildICMPEchoRequest(id uint16, seq uint16) []byte {
	pkt := make([]byte, 16)
	pkt[0] = 8 // Echo Request
	pkt[1] = 0 // Code 0
	binary.BigEndian.PutUint16(pkt[4:6], id)
	binary.BigEndian.PutUint16(pkt[6:8], seq)
	copy(pkt[8:], "BPORTSCN")

	var sum uint32
	for i := 0; i+1 < len(pkt); i += 2 {
		sum += uint32(binary.BigEndian.Uint16(pkt[i : i+2]))
	}
	for (sum >> 16) > 0 {
		sum = (sum & 0xffff) + (sum >> 16)
	}
	binary.BigEndian.PutUint16(pkt[2:4], ^uint16(sum))
	return pkt
}

func pingHostOS(ctx context.Context, ip string, timeoutMs int) (bool, int64) {
	if timeoutMs <= 0 {
		timeoutMs = 600
	}
	var args []string
	if runtime.GOOS == "windows" {
		args = []string{"-n", "1", "-w", strconv.Itoa(timeoutMs), ip}
	} else {
		sec := (timeoutMs + 999) / 1000
		if sec < 1 {
			sec = 1
		}
		args = []string{"-c", "1", "-W", strconv.Itoa(sec), ip}
	}

	cmdCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs+1500)*time.Millisecond)
	defer cancel()

	t0 := time.Now()
	cmd := exec.CommandContext(cmdCtx, "ping", args...)
	if err := cmd.Run(); err != nil {
		return false, 0
	}
	rtt := time.Since(t0).Milliseconds()
	if rtt == 0 {
		rtt = 1
	}
	return true, rtt
}
