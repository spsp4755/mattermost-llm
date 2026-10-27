jest.mock('mattermost-redux/actions/posts', () => ({receivedPost: (post: unknown) => ({type: 'RECEIVED_POST', data: post})}), {virtual: true});
jest.mock('mattermost-redux/client', () => ({Client4: {getPost: jest.fn()}}), {virtual: true});

import {createThreadOpenHandler} from './thread_open';

function setup() {
    let state: any = {entities: {users: {currentUserId: 'me'}, channels: {currentChannelId: 'channel'}, posts: {posts: {root: {id: 'root'}}}}};
    const store: any = {getState: () => state, dispatch: jest.fn()};
    return {store, handle: createThreadOpenHandler(store), setState: (next: any) => { state = next; }};
}
const event: any = {data: {user_id: 'me', channel_id: 'channel', root_id: 'root', request_id: 'question'}};

test('opens the native thread once for the requester', () => {
    const {store, handle} = setup();
    handle(event);
    handle(event);
    expect(store.dispatch).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({type: 'SELECT_POST', postId: 'root', channelId: 'channel'}));
});

test('does not move other users or another active channel', () => {
    const {store, handle} = setup();
    handle({data: {...event.data, user_id: 'other'}} as any);
    handle({data: {...event.data, channel_id: 'other'}} as any);
    handle({data: {}} as any);
    expect(store.dispatch).not.toHaveBeenCalled();
});

test('rechecks active channel after loading a missing root post', async () => {
    const {Client4} = require('mattermost-redux/client');
    let resolve: (post: any) => void = () => undefined;
    Client4.getPost.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const {store, handle, setState} = setup();
    setState({entities: {users: {currentUserId: 'me'}, channels: {currentChannelId: 'channel'}, posts: {posts: {}}}});
    const pending = handle(event);
    setState({entities: {users: {currentUserId: 'me'}, channels: {currentChannelId: 'elsewhere'}, posts: {posts: {}}}});
    resolve({id: 'root', channel_id: 'channel'});
    await pending;
    expect(store.dispatch).not.toHaveBeenCalled();
});
