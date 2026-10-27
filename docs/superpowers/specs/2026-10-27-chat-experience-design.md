# Mattermost 10.11 chat experience

Target: Mattermost 10.11.10; existing Go/React plugin, offline bundle.

User requirements: viewport-centered rendering popups, administrator control of reasoning display and generation independently for changing models, automatic RHS thread opening for the requester, and applicable upstream improvements. User confirmed default hidden reasoning with per-bot display/generation controls.

Approach: reuse existing post rendering, configuration and OpenAI-compatible transport. Move dialogs to a body portal with keyboard focus management. Filter reasoning at the transport boundary before posts, history, and streaming snapshots; never fall back to raw reasoning when no answer exists. Per-bot show_reasoning=false, thinking_mode=default/enabled/disabled, thinking_parameter selects the endpoint dialect without guessing model names. Existing extra_request_json supports other endpoint options. Secondary models inherit display policy but retain their own generation defaults because their endpoints may use a different dialect.

Auto-open: targeted server event after the progress post is created; only the requester in the same active channel opens the native thread once. Per-bot auto_open_thread defaults true; explicit false disables. Do not reopen on streaming updates or old posts.

Alternatives: CSS-only fixed dialogs remain affected by transformed parents; frontend-only reasoning hiding exposes text through mobile/API; model-name guessing breaks aliases. These are rejected in favor of server filtering and explicit parameter dialects.

Additional improvements: error events in SSE must fail rather than masquerade as answers; reserve stream in extra JSON; dialogs restore focus and support Escape/Tab.

Limits: no arbitrary classification of unmarked prose as reasoning; configure the serving engine's reasoning parser. Generation disabling depends on endpoint/model support. No rewrite of historic posts. No production deployment or unrelated agent/tool/RAG features.
