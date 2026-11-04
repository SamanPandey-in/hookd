package config

import (
	"bufio"
	"os"
	"strings"
)

// loadDotEnv loads KEY=VALUE pairs from a .env file into the process environment
// WITHOUT overriding variables already present (a real environment always wins).
//
// It is a local-dev convenience: run `go run ./cmd/server` from the server
// directory and the adjacent .env is picked up automatically. In production
// (EC2) the real environment is set directly and no .env file need exist.
//
// Values are read literally — so a DATABASE_URL containing `?sslmode=require&
// channel_binding=require` is safe (unlike `source .env` in a shell, where the
// `&` would be interpreted). Lines may be blank, `#` comments, or KEY=VALUE with
// an optional surrounding pair of single/double quotes and an optional `export `.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // missing file is a no-op
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		eq := strings.IndexByte(line, '=')
		if eq <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		val := strings.TrimSpace(line[eq+1:])
		if len(val) >= 2 {
			if (val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'') {
				val = val[1 : len(val)-1]
			}
		}
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, val)
		}
	}
}
