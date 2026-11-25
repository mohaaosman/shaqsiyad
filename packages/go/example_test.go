package shaqsiyad_test

import (
	"fmt"

	shaqsiyad "github.com/mohaaosman/shaqsiyad/packages/go"
)

func ExampleClient_AvatarURL() {
	api := shaqsiyad.New(shaqsiyad.WithBaseURL(shaqsiyad.DefaultBaseURL))
	fmt.Println(api.AvatarURL("shq_00042", 128, "png"))
	// Output: https://shaqsiyad.example/api/v1/personas/shq_00042/avatar?format=png&size=128
}
