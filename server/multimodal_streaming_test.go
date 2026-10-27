package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestMultimodalStreamDeliversAnswerBeforeServerCompletes(t *testing.T) {
	for _, withImage := range []bool{false, true} {
		t.Run(fmt.Sprint("image=", withImage), func(t *testing.T) {
			firstReceived := make(chan struct{})
			requestBody := make(chan map[string]any, 1)
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					http.Error(w, "invalid JSON", 400)
					return
				}
				requestBody <- body
				w.Header().Set("Content-Type", "text/event-stream")
				fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"private\"}}]}\n\n")
				fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"첫 답변\"}}]}\n\n")
				w.(http.Flusher).Flush()
				// Completion cannot arrive until the client has delivered the first answer.
				select {
				case <-firstReceived:
				case <-r.Context().Done():
					return
				}
				fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\" 완료\"}}]}\n\ndata: [DONE]\n\n")
			}))
			defer server.Close()
			bot := BotDefinition{Mode: "multimodal", Model: "test-model"}
			require.True(t, shouldUseDoc2VLLMStreaming(&runtimeConfiguration{EnableStreaming: true}, bot))
			var content any = "설명해줘"
			if withImage {
				content = []doc2vllmContentPart{{Type: "text", Text: "설명해줘"}, {Type: "image_url", ImageURL: &doc2vllmImageURLPart{URL: "data:image/png;base64,dGVzdA=="}}}
			}
			snapshots := []string{}
			result, _, err := (&Plugin{}).performDoc2VLLMStreamRequest(ctx,
				doc2vllmServiceConfig{BaseURL: server.URL, Timeout: 3 * time.Second}, bot, botAttachment{},
				doc2vllmChatRequest{Model: bot.Model, Stream: true, Messages: []doc2vllmMessage{{Role: "user", Content: content}}},
				doc2vllmRequestDebug{}, func(text string) error {
					snapshots = append(snapshots, text)
					if len(snapshots) == 1 {
						close(firstReceived)
					}
					return nil
				})
			require.NoError(t, err)
			require.Equal(t, true, (<-requestBody)["stream"])
			require.Equal(t, []string{"첫 답변", "첫 답변 완료"}, snapshots)
			require.Equal(t, "첫 답변 완료", extractDoc2VLLMResponseText(result.Response))
		})
	}
}
