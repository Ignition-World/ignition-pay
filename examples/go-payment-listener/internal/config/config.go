package config

import (
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Horizon struct {
		URL           string `mapstructure:"url"`
		TargetAccount string `mapstructure:"target_account"`
		StartCursor   string `mapstructure:"start_cursor"`
	} `mapstructure:"horizon"`
	Logging struct {
		Level  string `mapstructure:"level"`
		Format string `mapstructure:"format"`
	} `mapstructure:"logging"`
	Retry struct {
		MaxAttempts      int `mapstructure:"max_attempts"`
		BaseDelaySeconds int `mapstructure:"base_delay_seconds"`
		MaxDelaySeconds  int `mapstructure:"max_delay_seconds"`
	} `mapstructure:"retry"`
	Metrics struct {
		Enabled bool `mapstructure:"enabled"`
		Port    int  `mapstructure:"port"`
	} `mapstructure:"metrics"`
}

func Load(path string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	v.SetDefault("retry.max_attempts", 10)
	v.SetDefault("retry.base_delay_seconds", 1)
	v.SetDefault("retry.max_delay_seconds", 30)

	if err := v.ReadInConfig(); err != nil {
		return nil, err
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
