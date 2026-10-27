package main

import (
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestOpenThreadOnlyTargetsRequesterAndRespectsOptOut(t *testing.T) {
	api := &plugintest.API{}
	p := &Plugin{}
	p.SetAPI(api)
	request := BotRunRequest{UserID: model.NewId(), ChannelID: model.NewId(), RootID: model.NewId(), TriggerPostID: model.NewId()}
	post := &model.Post{Id: model.NewId(), RootId: request.RootID, ChannelId: request.ChannelID}
	api.On("PublishWebSocketEvent", "open_thread", mock.MatchedBy(func(data map[string]interface{}) bool {
		return data["root_id"] == request.RootID && data["user_id"] == request.UserID
	}), mock.MatchedBy(func(b *model.WebsocketBroadcast) bool { return b.UserId == request.UserID && b.ChannelId == "" })).Once()
	p.publishThreadOpen(request, BotDefinition{}, post)
	disabled := false
	p.publishThreadOpen(request, BotDefinition{AutoOpenThread: &disabled}, post)
	p.publishThreadOpen(BotRunRequest{}, BotDefinition{}, post)
	require.True(t, api.AssertExpectations(t))
}

func TestNewBotJoinsTeamBeforeChannel(t *testing.T) {
	api := &plugintest.API{}
	p := &Plugin{}
	p.SetAPI(api)
	channelID, teamID, userID := model.NewId(), model.NewId(), model.NewId()
	missing := model.NewAppError("test", "not_found", nil, "", 404)
	api.On("GetChannelMember", channelID, userID).Return((*model.ChannelMember)(nil), missing)
	api.On("GetChannel", channelID).Return(&model.Channel{Id: channelID, TeamId: teamID}, nil)
	api.On("GetTeamMember", teamID, userID).Return((*model.TeamMember)(nil), missing)
	api.On("CreateTeamMember", teamID, userID).Return(&model.TeamMember{TeamId: teamID, UserId: userID}, nil).Once()
	api.On("AddUserToChannel", channelID, userID, "").Return(&model.ChannelMember{ChannelId: channelID, UserId: userID}, nil).Once()
	require.NoError(t, p.ensureBotInChannel(channelID, userID))
	api.AssertExpectations(t)
}
