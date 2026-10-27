package main

import "github.com/mattermost/mattermost/server/public/model"

func (p *Plugin) publishThreadOpen(request BotRunRequest, bot BotDefinition, post *model.Post) {
	if request.UserID == "" || post == nil || post.Id == "" || (bot.AutoOpenThread != nil && !*bot.AutoOpenThread) {
		return
	}
	rootID := post.RootId
	if rootID == "" {
		rootID = post.Id
	}
	p.API.PublishWebSocketEvent("open_thread", map[string]interface{}{
		"user_id": request.UserID, "channel_id": post.ChannelId, "root_id": rootID, "request_id": post.Id,
	}, &model.WebsocketBroadcast{UserId: request.UserID})
}
