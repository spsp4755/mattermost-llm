import type {Store} from 'redux';
import type {GlobalState} from '@mattermost/types/store';
import {receivedPost} from 'mattermost-redux/actions/posts';
import {Client4} from 'mattermost-redux/client';

type ThreadOpenEvent = {data?: {user_id?: string; channel_id?: string; root_id?: string; request_id?: string}};

export function createThreadOpenHandler(store: Store<GlobalState>) {
    const seen = new Set<string>();
    return async ({data}: ThreadOpenEvent) => {
        if (!data?.request_id || !data.root_id || !data.channel_id || seen.has(data.request_id)) {
            return;
        }
        const activeRequest = () => {
            const state = store.getState();
            return data.user_id === state.entities.users.currentUserId && data.channel_id === state.entities.channels.currentChannelId;
        };
        // Consume even inactive-channel events so they cannot reopen later after a replay.
        seen.add(data.request_id);
        if (seen.size > 100) {
            seen.delete(seen.values().next().value!);
        }
        if (!activeRequest()) {
            return;
        }
        try {
            if (!store.getState().entities.posts.posts[data.root_id]) {
                const post = await Client4.getPost(data.root_id);
                if (post.channel_id !== data.channel_id || !activeRequest()) {
                    return;
                }
                store.dispatch(receivedPost(post) as any);
            }
            // Mattermost 10.11.10's native RHS action, also used by Agents' legacy mode.
            store.dispatch({type: 'SELECT_POST', postId: data.root_id, channelId: data.channel_id, timestamp: Date.now()});
        } catch {
            // The user can still use Reply if the post was deleted or permissions changed.
        }
    };
}
