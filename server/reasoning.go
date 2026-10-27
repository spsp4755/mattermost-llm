package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

func validateThinkingSettings(bot BotDefinition) error {
	switch bot.ThinkingMode {
	case "", "default", "enabled", "disabled":
	default:
		return fmt.Errorf("invalid thinking_mode %q", bot.ThinkingMode)
	}
	switch bot.ThinkingParameter {
	case "", "chat_template_kwargs.enable_thinking", "chat_template_kwargs.thinking", "thinking.type", "enable_thinking":
	default:
		return fmt.Errorf("invalid thinking_parameter %q", bot.ThinkingParameter)
	}
	if bot.ThinkingMode != "" && bot.ThinkingMode != "default" && bot.ThinkingParameter == "" {
		return fmt.Errorf("thinking_parameter is required when thinking_mode is enabled or disabled")
	}
	return nil
}

func applyThinkingSettings(body map[string]any, bot BotDefinition) error {
	if err := validateThinkingSettings(bot); err != nil {
		return err
	}
	if bot.ThinkingMode == "" || bot.ThinkingMode == "default" {
		return nil
	}
	enabled := bot.ThinkingMode == "enabled"
	path := strings.Split(bot.ThinkingParameter, ".")
	var value any = enabled
	if bot.ThinkingParameter == "thinking.type" {
		value = bot.ThinkingMode
	}
	if len(path) == 1 {
		body[path[0]] = value
		return nil
	}
	nested, ok := body[path[0]].(map[string]any)
	if body[path[0]] != nil && !ok {
		return fmt.Errorf("%s must be a JSON object", path[0])
	}
	if nested == nil {
		nested = map[string]any{}
	}
	nested[path[1]] = value
	body[path[0]] = nested
	return nil
}

var reasoningHeading = regexp.MustCompile(`(?i)^(?:#{1,6}[ \t]+)?(?:\*\*)?(?:reasoning|thinking)(?:\*\*)?[ \t]*(?::[ \t]*|\r?\n)`)
var answerHeading = regexp.MustCompile(`(?im)^[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?(?:final[ \t]+answer|answer)(?:\*\*)?[ \t]*(?::[ \t]*|\r?\n)`)
var inlinePrivateBlock = regexp.MustCompile(`(?is)<(?:think|thinking|reasoning|analysis)>.*?(?:</(?:think|thinking|reasoning|analysis)>|$)`)

// Parse only explicit leading reasoning markers; ordinary prose and code examples are answers.
func splitInlineReasoningSections(text string) assistantResponseParts {
	text = strings.TrimSpace(strings.ToValidUTF8(text, ""))
	parts := assistantResponseParts{}
	for text != "" {
		lower := strings.ToLower(text)
		matched := false
		for _, tag := range []string{"think", "thinking", "reasoning", "analysis"} {
			open, close := "<"+tag+">", "</"+tag+">"
			if strings.HasPrefix(open, lower) && len(text) < len(open) {
				return parts
			}
			if !strings.HasPrefix(lower, open) {
				continue
			}
			rest := text[len(open):]
			end := strings.Index(strings.ToLower(rest), close)
			if end < 0 {
				// A closing marker may itself be split across streamed tokens.
				for n := 1; n < len(close) && n <= len(rest); n++ {
					if strings.HasSuffix(strings.ToLower(rest), close[:n]) {
						rest = rest[:len(rest)-n]
						break
					}
				}
				parts.Reasoning = strings.TrimSpace(parts.Reasoning + "\n" + rest)
				return parts
			}
			parts.Reasoning = strings.TrimSpace(parts.Reasoning + "\n" + rest[:end])
			text = strings.TrimSpace(rest[end+len(close):])
			matched = true
			break
		}
		if !matched {
			break
		}
	}
	// Understand the plugin's serialized display format as well as explicit heading output.
	if strings.HasPrefix(text, "**Answer**\n\n") {
		if answer, reason, ok := strings.Cut(strings.TrimPrefix(text, "**Answer**\n\n"), "\n\n**Reasoning**\n\n"); ok {
			return assistantResponseParts{Answer: answer, Reasoning: reason}
		}
	}
	if head := reasoningHeading.FindStringIndex(text); head != nil {
		rest := text[head[1]:]
		if end := answerHeading.FindStringIndex(rest); end != nil {
			return assistantResponseParts{Answer: strings.TrimSpace(rest[end[1]:]), Reasoning: strings.TrimSpace(rest[:end[0]])}
		}
		return assistantResponseParts{Reasoning: strings.TrimSpace(rest)}
	}
	parts.Answer = text
	return parts
}

func filterResponseReasoning(response doc2vllmOCRResponse, show bool) doc2vllmOCRResponse {
	for i := range response.Choices {
		parts := extractChoiceResponseParts(response.Choices[i])
		response.Choices[i].Message.Content = parts.Answer
		response.Choices[i].Message.ReasoningContent = nil
		response.Choices[i].Message.Reasoning = nil
		if show {
			response.Choices[i].Message.Reasoning = parts.Reasoning
		}
	}
	return response
}

// Errors may contain echoed model output too; filter before generating public error details.
func redactProviderBody(body []byte, show bool) []byte {
	if show {
		return body
	}
	var value any
	if json.Unmarshal(body, &value) != nil {
		return []byte(splitInlineReasoningSections(inlinePrivateBlock.ReplaceAllString(string(body), "")).Answer)
	}
	var clean func(any) any
	clean = func(v any) any {
		switch x := v.(type) {
		case map[string]any:
			if kind, _ := x["type"].(string); isReasoningKey(strings.ToLower(kind)) {
				return nil
			}
			for key, child := range x {
				if isReasoningKey(strings.ToLower(key)) {
					delete(x, key)
				} else {
					x[key] = clean(child)
				}
			}
		case []any:
			for i, child := range x {
				x[i] = clean(child)
			}
		case string:
			return splitInlineReasoningSections(inlinePrivateBlock.ReplaceAllString(x, "")).Answer
		}
		return v
	}
	result, _ := json.Marshal(clean(value))
	return result
}

func typedReasoningText(value any) string {
	switch v := value.(type) {
	case []any:
		var out strings.Builder
		for _, item := range v {
			out.WriteString(typedReasoningText(item))
		}
		return out.String()
	case map[string]any:
		kind, _ := v["type"].(string)
		if isReasoningKey(strings.ToLower(kind)) {
			for _, key := range []string{"text", "thinking", "reasoning", "content"} {
				if text, ok := v[key].(string); ok {
					return text
				}
			}
		}
	}
	return ""
}
