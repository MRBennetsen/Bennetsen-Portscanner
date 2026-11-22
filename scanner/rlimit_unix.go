//go:build !windows

package main

import "syscall"

func raiseFileLimit() {
	var rlim syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_NOFILE, &rlim); err != nil {
		return
	}
	target := uint64(16384)
	if rlim.Max > 0 && rlim.Max < target {
		target = rlim.Max
	}
	if rlim.Cur < target {
		rlim.Cur = target
		_ = syscall.Setrlimit(syscall.RLIMIT_NOFILE, &rlim)
	}
}
