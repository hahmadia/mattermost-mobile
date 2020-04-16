// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'assert';
import nock from 'nock';
import fs from 'fs';

import {NavigationTypes} from '@constants';
import {logout} from '@actions/views/user';
import * as Actions from '@mm-redux/actions/users';
import {Client4} from '@mm-redux/client';
import {RequestStatus} from '../constants';
import TestHelper from 'test/test_helper';
import configureStore from 'test/test_store';
import deepFreeze from '@mm-redux/utils/deep_freeze';
import EventEmitter from '@mm-redux/utils/event_emitter';

import initialState from '@mm-redux/store/initial_state';

const OK_RESPONSE = {status: 'OK'};
const UNAUTHORIZED = {status_code: 401};

describe('Actions.Users', () => {
    let store;
    beforeAll(async () => {
        await TestHelper.initBasic(Client4);
    });

    beforeEach(async () => {
        const initial = {
            ...initialState,
            entities: {
                ...initialState.entities,
                users: {
                    ...initialState.entities.users,
                    currentUserId: 'current-user-id',
                },
            },
        };
        store = await configureStore(initial);
    });

    afterAll(async () => {
        await TestHelper.tearDown();
    });

    it('createUser', async () => {
        const userToCreate = TestHelper.fakeUser();
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(201, {...userToCreate, id: TestHelper.generateId()});

        const {data: user} = await Actions.createUser(userToCreate)(store.dispatch, store.getState);

        const state = store.getState();
        const {profiles} = state.entities.users;

        assert.ok(profiles);
        assert.ok(profiles[user.id]);
    });

    it('login', async () => {
        const user = TestHelper.basicUser;

        nock(Client4.getBaseRoute()).
            post('/users/logout').
            reply(200, OK_RESPONSE);

        await TestHelper.basicClient4.logout();

        TestHelper.mockLogin();

        await Actions.login(user.email, user.password)(store.dispatch, store.getState);

        const state = store.getState();
        const loginRequest = state.requests.users.login;
        const {currentUserId, profiles} = state.entities.users;
        const preferences = state.entities.preferences.myPreferences;
        const teamMembers = state.entities.teams.myMembers;
        const serverVersion = state.entities.general.serverVersion;

        if (loginRequest.status === RequestStatus.FAILURE) {
            throw new Error(JSON.stringify(loginRequest.error));
        }

        assert.ok(currentUserId);
        assert.ok(profiles);
        assert.ok(profiles[currentUserId]);
        assert.ok(Object.keys(preferences).length);
        assert.ok(serverVersion);

        Object.keys(teamMembers).forEach((id) => {
            assert.ok(teamMembers[id].team_id);
            assert.equal(teamMembers[id].user_id, currentUserId);
        });
    });

    it('loginById', async () => {
        const user = TestHelper.basicUser;

        nock(Client4.getBaseRoute()).
            post('/users/logout').
            reply(200, OK_RESPONSE);

        await TestHelper.basicClient4.logout();

        TestHelper.mockLogin();

        await Actions.loginById(user.id, 'password1')(store.dispatch, store.getState);

        const state = store.getState();
        const {currentUserId, profiles} = state.entities.users;
        const preferences = state.entities.preferences.myPreferences;
        const teamMembers = state.entities.teams.myMembers;

        assert.ok(currentUserId);
        assert.ok(profiles);
        assert.ok(profiles[currentUserId]);
        assert.ok(Object.keys(preferences).length);

        Object.keys(teamMembers).forEach((id) => {
            assert.ok(teamMembers[id].team_id);
            assert.equal(teamMembers[id].user_id, currentUserId);
        });
    });

    it('getTermsOfService', async () => {
        const response = {
            create_at: 1537976679426,
            id: '1234',
            text: 'Terms of Service',
            user_id: '1',
        };

        nock(Client4.getBaseRoute()).
            get('/terms_of_service').
            reply(200, response);

        const {data} = await Actions.getTermsOfService()(store.dispatch, store.getState);

        assert.deepEqual(data, response);
    });

    it('updateMyTermsOfServiceStatus accept terms', async () => {
        const user = TestHelper.basicUser;
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(201, {...TestHelper.fakeUserWithId()});

        TestHelper.mockLogin();
        await Actions.login(user.email, 'password1')(store.dispatch, store.getState);

        nock(Client4.getBaseRoute()).
            post('/users/me/terms_of_service').
            reply(200, OK_RESPONSE);

        await Actions.updateMyTermsOfServiceStatus(1, true)(store.dispatch, store.getState);

        const {currentUserId} = store.getState().entities.users;
        const currentUser = store.getState().entities.users.profiles[currentUserId];

        assert.ok(currentUserId);
        assert.ok(currentUser.terms_of_service_id);
        assert.ok(currentUser.terms_of_service_create_at);
        assert.equal(currentUser.terms_of_service_id, 1);
    });

    it('updateMyTermsOfServiceStatus reject terms', async () => {
        const user = TestHelper.basicUser;
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(201, {...TestHelper.fakeUserWithId()});

        TestHelper.mockLogin();
        await Actions.login(user.email, 'password1')(store.dispatch, store.getState);

        nock(Client4.getBaseRoute()).
            post('/users/me/terms_of_service').
            reply(200, OK_RESPONSE);

        await Actions.updateMyTermsOfServiceStatus(1, false)(store.dispatch, store.getState);

        const {currentUserId, myAcceptedTermsOfServiceId} = store.getState().entities.users;

        assert.ok(currentUserId);
        assert.notEqual(myAcceptedTermsOfServiceId, 1);
    });

    it('logout', async () => {
        const emit = jest.spyOn(EventEmitter, 'emit');
        nock(Client4.getBaseRoute()).
            post('/users/logout').
            reply(200, OK_RESPONSE);

        await store.dispatch(logout(false));
        expect(emit).toHaveBeenCalledWith(NavigationTypes.NAVIGATION_RESET);

        nock(Client4.getBaseRoute()).
            post('/users/login').
            reply(200, TestHelper.basicUser);
        await TestHelper.basicClient4.login(TestHelper.basicUser.email, 'password1');
    });

    it('getProfiles', async () => {
        nock(Client4.getBaseRoute()).
            get('/users').
            query(true).
            reply(200, [TestHelper.basicUser]);

        await Actions.getProfiles(0)(store.dispatch, store.getState);
        const {profiles} = store.getState().entities.users;

        assert.ok(Object.keys(profiles).length);
    });

    it('getProfilesByIds', async () => {
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(200, TestHelper.fakeUserWithId());

        const user = await TestHelper.basicClient4.createUser(TestHelper.fakeUser());

        nock(Client4.getBaseRoute()).
            post('/users/ids').
            reply(200, [user]);

        await Actions.getProfilesByIds([user.id])(store.dispatch, store.getState);
        const {profiles} = store.getState().entities.users;

        assert.ok(profiles[user.id]);
    });

    it('getMissingProfilesByIds', async () => {
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(200, TestHelper.fakeUserWithId());

        const user = await TestHelper.basicClient4.createUser(TestHelper.fakeUser());

        nock(Client4.getBaseRoute()).
            post('/users/ids').
            reply(200, [user]);

        await Actions.getMissingProfilesByIds([user.id])(store.dispatch, store.getState);
        const {profiles} = store.getState().entities.users;

        assert.ok(profiles[user.id]);
    });

    it('getProfilesByUsernames', async () => {
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(200, TestHelper.fakeUserWithId());

        const user = await TestHelper.basicClient4.createUser(TestHelper.fakeUser());

        nock(Client4.getBaseRoute()).
            post('/users/usernames').
            reply(200, [user]);

        await Actions.getProfilesByUsernames([user.username])(store.dispatch, store.getState);
        const {profiles} = store.getState().entities.users;

        assert.ok(profiles[user.id]);
    });

    it('getProfilesInTeam', async () => {
        nock(Client4.getBaseRoute()).
            get('/users').
            query(true).
            reply(200, [TestHelper.basicUser]);

        await Actions.getProfilesInTeam(TestHelper.basicTeam.id, 0)(store.dispatch, store.getState);

        const {profilesInTeam, profiles} = store.getState().entities.users;
        const team = profilesInTeam[TestHelper.basicTeam.id];

        assert.ok(team);
        assert.ok(team.has(TestHelper.basicUser.id));
        assert.equal(Object.keys(profiles).length, team.size, 'profiles != profiles in team');
    });

    it('getProfilesNotInTeam', async () => {
        const team = TestHelper.basicTeam;

        nock(Client4.getBaseRoute()).
            post('/users').
            reply(200, TestHelper.fakeUserWithId());

        const user = await TestHelper.basicClient4.createUser(TestHelper.fakeUser());

        nock(Client4.getBaseRoute()).
            get('/users').
            query(true).
            reply(200, [user]);

        await Actions.getProfilesNotInTeam(team.id, 0)(store.dispatch, store.getState);

        const {profilesNotInTeam} = store.getState().entities.users;
        const notInTeam = profilesNotInTeam[team.id];

        assert.ok(notInTeam);
        assert.ok(notInTeam.size > 0);
    });

    it('getProfilesWithoutTeam', async () => {
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(200, TestHelper.fakeUserWithId());

        const user = await TestHelper.basicClient4.createUser(TestHelper.fakeUser());

        nock(Client4.getBaseRoute()).
            get('/users').
            query(true).
            reply(200, [user]);

        await Actions.getProfilesWithoutTeam(0)(store.dispatch, store.getState);
        const {profilesWithoutTeam, profiles} = store.getState().entities.users;

        assert.ok(profilesWithoutTeam);
        assert.ok(profilesWithoutTeam.size > 0);
        assert.ok(profiles);
        assert.ok(Object.keys(profiles).length > 0);
    });

    it('getProfilesInChannel', async () => {
        nock(Client4.getBaseRoute()).
            get('/users').
            query(true).
            reply(200, [TestHelper.basicUser]);

        await Actions.getProfilesInChannel(
            TestHelper.basicChannel.id,
            0,
        )(store.dispatch, store.getState);

        const {profiles, profilesInChannel} = store.getState().entities.users;

        const channel = profilesInChannel[TestHelper.basicChannel.id];
        assert.ok(channel.has(TestHelper.basicUser.id));
        assert.equal(Object.keys(profiles).length, channel.size, 'profiles != profiles in channel');
    });

    it('getProfilesNotInChannel', async () => {
        nock(Client4.getBaseRoute()).
            post('/users').
            query(true).
            reply(200, TestHelper.fakeUserWithId());

        const user = await TestHelper.basicClient4.createUser(
            TestHelper.fakeUser(),
            null,
            null,
            TestHelper.basicTeam.invite_id,
        );

        nock(Client4.getBaseRoute()).
            get('/users').
            query(true).
            reply(200, [user]);

        await Actions.getProfilesNotInChannel(
            TestHelper.basicTeam.id,
            TestHelper.basicChannel.id,
            0,
        )(store.dispatch, store.getState);

        const {profiles, profilesNotInChannel} = store.getState().entities.users;

        const channel = profilesNotInChannel[TestHelper.basicChannel.id];
        assert.ok(channel.has(user.id));
        assert.equal(Object.keys(profiles).length, channel.size, 'profiles != profiles in channel');
    });

    it('getUser', async () => {
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(200, TestHelper.fakeUserWithId());

        const user = await TestHelper.basicClient4.createUser(TestHelper.fakeUser());

        nock(Client4.getBaseRoute()).
            get(`/users/${user.id}`).
            reply(200, user);

        await Actions.getUser(
            user.id,
        )(store.dispatch, store.getState);

        const state = store.getState();
        const {profiles} = state.entities.users;

        assert.ok(profiles[user.id]);
        assert.equal(profiles[user.id].id, user.id);
    });

    it('getMe', async () => {
        nock(Client4.getBaseRoute()).
            get('/users/me').
            reply(200, TestHelper.basicUser);

        await Actions.getMe()(store.dispatch, store.getState);

        const state = store.getState();
        const {profiles, currentUserId} = state.entities.users;

        assert.ok(profiles[currentUserId]);
        assert.equal(profiles[currentUserId].id, currentUserId);
    });

    it('getUserByUsername', async () => {
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(200, TestHelper.fakeUserWithId());

        const user = await TestHelper.basicClient4.createUser(TestHelper.fakeUser());

        nock(Client4.getBaseRoute()).
            get(`/users/username/${user.username}`).
            reply(200, user);

        await Actions.getUserByUsername(
            user.username,
        )(store.dispatch, store.getState);

        const state = store.getState();
        const {profiles} = state.entities.users;

        assert.ok(profiles[user.id]);
        assert.equal(profiles[user.id].username, user.username);
    });

    it('getUserByEmail', async () => {
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(200, TestHelper.fakeUserWithId());

        const user = await TestHelper.basicClient4.createUser(TestHelper.fakeUser());

        nock(Client4.getBaseRoute()).
            get(`/users/email/${user.email}`).
            reply(200, user);

        await Actions.getUserByEmail(
            user.email,
        )(store.dispatch, store.getState);

        const state = store.getState();
        const {profiles} = state.entities.users;

        assert.ok(profiles[user.id]);
        assert.equal(profiles[user.id].email, user.email);
    });

    it('searchProfiles', async () => {
        const user = TestHelper.basicUser;

        nock(Client4.getBaseRoute()).
            post('/users/search').
            reply(200, [user]);

        await Actions.searchProfiles(
            user.username,
        )(store.dispatch, store.getState);

        const state = store.getState();
        const {profiles} = state.entities.users;

        assert.ok(profiles[user.id]);
        assert.equal(profiles[user.id].id, user.id);
    });

    it('getStatusesByIds', async () => {
        nock(Client4.getBaseRoute()).
            post('/users/status/ids').
            reply(200, [{user_id: TestHelper.basicUser.id, status: 'online', manual: false, last_activity_at: 1507662212199}]);

        await Actions.getStatusesByIds(
            [TestHelper.basicUser.id],
        )(store.dispatch, store.getState);

        const statuses = store.getState().entities.users.statuses;

        assert.ok(statuses[TestHelper.basicUser.id]);
        assert.equal(Object.keys(statuses).length, 1);
    });

    it('getTotalUsersStats', async () => {
        nock(Client4.getBaseRoute(TestHelper.basicUser.id)).
            get('/users/stats').
            reply(200, {total_users_count: 2605});
        await Actions.getTotalUsersStats()(store.dispatch, store.getState);

        const {stats} = store.getState().entities.users;

        assert.equal(stats.total_users_count, 2605);
    });

    it('getStatus', async () => {
        const user = TestHelper.basicUser;

        nock(Client4.getBaseRoute()).
            get(`/users/${user.id}/status`).
            reply(200, {user_id: user.id, status: 'online', manual: false, last_activity_at: 1507662212199});

        await Actions.getStatus(
            user.id,
        )(store.dispatch, store.getState);

        const statuses = store.getState().entities.users.statuses;
        assert.ok(statuses[user.id]);
    });

    it('setStatus', async () => {
        nock(Client4.getBaseRoute()).
            put(`/users/${TestHelper.basicUser.id}/status`).
            reply(200, OK_RESPONSE);

        await Actions.setStatus(
            {user_id: TestHelper.basicUser.id, status: 'away'},
        )(store.dispatch, store.getState);

        const statuses = store.getState().entities.users.statuses;
        assert.ok(statuses[TestHelper.basicUser.id] === 'away');
    });

    it('getSessions', async () => {
        nock(Client4.getBaseRoute()).
            get(`/users/${TestHelper.basicUser.id}/sessions`).
            reply(200, [{id: TestHelper.generateId(), create_at: 1507756921338, expires_at: 1510348921338, last_activity_at: 1507821125630, user_id: TestHelper.basicUser.id, device_id: '', roles: 'system_admin system_user'}]);

        await Actions.getSessions(TestHelper.basicUser.id)(store.dispatch, store.getState);

        const sessions = store.getState().entities.users.mySessions;

        assert.ok(sessions.length);
        assert.equal(sessions[0].user_id, TestHelper.basicUser.id);
    });

    it('revokeSession', async () => {
        nock(Client4.getBaseRoute()).
            get(`/users/${TestHelper.basicUser.id}/sessions`).
            reply(200, [{id: TestHelper.generateId(), create_at: 1507756921338, expires_at: 1510348921338, last_activity_at: 1507821125630, user_id: TestHelper.basicUser.id, device_id: '', roles: 'system_admin system_user'}]);

        await Actions.getSessions(TestHelper.basicUser.id)(store.dispatch, store.getState);

        let sessions = store.getState().entities.users.mySessions;

        const sessionsLength = sessions.length;

        nock(Client4.getBaseRoute()).
            post(`/users/${TestHelper.basicUser.id}/sessions/revoke`).
            reply(200, OK_RESPONSE);
        await Actions.revokeSession(TestHelper.basicUser.id, sessions[0].id)(store.dispatch, store.getState);

        sessions = store.getState().entities.users.mySessions;
        assert.ok(sessions.length === sessionsLength - 1);

        nock(Client4.getBaseRoute()).
            post('/users/login').
            reply(200, TestHelper.basicUser);
        await TestHelper.basicClient4.login(TestHelper.basicUser.email, 'password1');
    });

    it('revokeSession and logout', async () => {
        nock(Client4.getBaseRoute()).
            get(`/users/${TestHelper.basicUser.id}/sessions`).
            reply(200, [{id: TestHelper.generateId(), create_at: 1507756921338, expires_at: 1510348921338, last_activity_at: 1507821125630, user_id: TestHelper.basicUser.id, device_id: '', roles: 'system_admin system_user'}]);

        await Actions.getSessions(TestHelper.basicUser.id)(store.dispatch, store.getState);

        const sessions = store.getState().entities.users.mySessions;

        nock(Client4.getBaseRoute()).
            post(`/users/${TestHelper.basicUser.id}/sessions/revoke`).
            reply(200, OK_RESPONSE);

        const {data: revokeSessionResponse} = await Actions.revokeSession(TestHelper.basicUser.id, sessions[0].id)(store.dispatch, store.getState);
        assert.deepEqual(revokeSessionResponse, true);

        nock(Client4.getBaseRoute()).
            get('/users').
            reply(401, {});

        await Actions.getProfiles(0)(store.dispatch, store.getState);

        const basicUser = TestHelper.basicUser;
        nock(Client4.getBaseRoute()).
            post('/users/login').
            reply(200, basicUser);
        const response = await TestHelper.basicClient4.login(TestHelper.basicUser.email, 'password1');
        assert.deepEqual(response.email, basicUser.email);
    });

    it('revokeAllSessionsForCurrentUser', async () => {
        const user = TestHelper.basicUser;
        nock(Client4.getBaseRoute()).
            post('/users/logout').
            reply(200, OK_RESPONSE);
        await TestHelper.basicClient4.logout();
        let sessions = store.getState().entities.users.mySessions;

        assert.strictEqual(sessions.length, 0);

        TestHelper.mockLogin();
        await store.dispatch(Actions.loginById(user.id, 'password1'));

        nock(Client4.getBaseRoute()).
            post('/users/login').
            reply(200, TestHelper.basicUser);
        await TestHelper.basicClient4.login(TestHelper.basicUser.email, 'password1');

        nock(Client4.getBaseRoute()).
            get(`/users/${user.id}/sessions`).
            reply(200, [{id: TestHelper.generateId(), create_at: 1507756921338, expires_at: 1510348921338, last_activity_at: 1507821125630, user_id: TestHelper.basicUser.id, device_id: '', roles: 'system_admin system_user'}, {id: TestHelper.generateId(), create_at: 1507756921338, expires_at: 1510348921338, last_activity_at: 1507821125630, user_id: TestHelper.basicUser.id, device_id: '', roles: 'system_admin system_user'}]);
        await store.dispatch(Actions.getSessions(user.id));

        sessions = store.getState().entities.users.mySessions;
        assert.ok(sessions.length > 1);

        nock(Client4.getBaseRoute()).
            post(`/users/${user.id}/sessions/revoke/all`).
            reply(200, OK_RESPONSE);
        const {data} = await store.dispatch(Actions.revokeAllSessionsForUser(user.id));
        assert.deepEqual(data, true);

        nock(Client4.getBaseRoute()).
            get('/users').
            query(true).
            reply(401, UNAUTHORIZED);
        await store.dispatch(Actions.getProfiles(0));

        nock(Client4.getBaseRoute()).
            post('/users/login').
            reply(200, TestHelper.basicUser);
        await TestHelper.basicClient4.login(TestHelper.basicUser.email, 'password1');
    });

    it('revokeSessionsForAllUsers', async () => {
        const user = TestHelper.basicUser;

        nock(Client4.getBaseRoute()).
            post('/roles/names').
            reply(200, []);

        nock(Client4.getBaseRoute()).
            post('/users/logout').
            reply(200, OK_RESPONSE);
        await TestHelper.basicClient4.logout();
        let sessions = store.getState().entities.users.mySessions;

        assert.strictEqual(sessions.length, 0);

        TestHelper.mockLogin();
        await store.dispatch(Actions.loginById(user.id, 'password1'));

        nock(Client4.getBaseRoute()).
            post('/users/login').
            reply(200, TestHelper.basicUser);
        await TestHelper.basicClient4.login(TestHelper.basicUser.email, 'password1');

        nock(Client4.getBaseRoute()).
            get(`/users/${user.id}/sessions`).
            reply(200, [{id: TestHelper.generateId(), create_at: 1507756921338, expires_at: 1510348921338, last_activity_at: 1507821125630, user_id: TestHelper.basicUser.id, device_id: '', roles: 'system_admin system_user'}, {id: TestHelper.generateId(), create_at: 1507756921338, expires_at: 1510348921338, last_activity_at: 1507821125630, user_id: TestHelper.basicUser.id, device_id: '', roles: 'system_admin system_user'}]);
        await store.dispatch(Actions.getSessions(user.id));

        sessions = store.getState().entities.users.mySessions;
        assert.ok(sessions.length > 1);

        nock(Client4.getBaseRoute()).
            post('/users/sessions/revoke/all').
            reply(200, OK_RESPONSE);
        const {data} = await store.dispatch(Actions.revokeSessionsForAllUsers(user.id));
        assert.deepEqual(data, true);

        nock(Client4.getBaseRoute()).
            post('/users/login').
            reply(200, TestHelper.basicUser);
        await TestHelper.basicClient4.login(TestHelper.basicUser.email, 'password1');
    });

    it('getUserAudits', async () => {
        nock(Client4.getBaseRoute()).
            get(`/users/${TestHelper.basicUser.id}/audits`).
            query(true).
            reply(200, [{id: TestHelper.generateId(), create_at: 1497285546645, user_id: TestHelper.basicUser.id, action: '/api/v4/users/login', extra_info: 'success', ip_address: '::1', session_id: ''}]);

        await Actions.getUserAudits(TestHelper.basicUser.id)(store.dispatch, store.getState);

        const audits = store.getState().entities.users.myAudits;

        assert.ok(audits.length);
        assert.equal(audits[0].user_id, TestHelper.basicUser.id);
    });

    it('autocompleteUsers', async () => {
        nock(Client4.getBaseRoute()).
            post('/users').
            query(true).
            reply(200, TestHelper.fakeUserWithId());

        const user = await TestHelper.basicClient4.createUser(
            TestHelper.fakeUser(),
            null,
            null,
            TestHelper.basicTeam.invite_id,
        );

        nock(Client4.getBaseRoute()).
            get('/users/autocomplete').
            query(true).
            reply(200, {users: [TestHelper.basicUser], out_of_channel: [user]});

        await Actions.autocompleteUsers(
            '',
            TestHelper.basicTeam.id,
            TestHelper.basicChannel.id,
        )(store.dispatch, store.getState);

        const autocompleteRequest = store.getState().requests.users.autocompleteUsers;
        const {profiles, profilesNotInChannel, profilesInChannel} = store.getState().entities.users;

        if (autocompleteRequest.status === RequestStatus.FAILURE) {
            throw new Error(JSON.stringify(autocompleteRequest.error));
        }

        const notInChannel = profilesNotInChannel[TestHelper.basicChannel.id];
        const inChannel = profilesInChannel[TestHelper.basicChannel.id];
        assert.ok(notInChannel.has(user.id));
        assert.ok(inChannel.has(TestHelper.basicUser.id));
        assert.ok(profiles[user.id]);
    });

    it('updateMe', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, TestHelper.basicUser.password)(store.dispatch, store.getState);

        const state = store.getState();
        const currentUser = state.entities.users.profiles[state.entities.users.currentUserId];
        const notifyProps = currentUser.notify_props;

        nock(Client4.getBaseRoute()).
            put('/users/me/patch').
            query(true).
            reply(200, {
                ...currentUser,
                notify_props: {
                    ...notifyProps,
                    comments: 'any',
                    email: 'false',
                    first_name: 'false',
                    mention_keys: '',
                    user_id: currentUser.id,
                },
            });

        await Actions.updateMe({
            notify_props: {
                ...notifyProps,
                comments: 'any',
                email: 'false',
                first_name: 'false',
                mention_keys: '',
                user_id: currentUser.id,
            },
        })(store.dispatch, store.getState);

        const updateRequest = store.getState().requests.users.updateMe;
        const {currentUserId, profiles} = store.getState().entities.users;
        const updateNotifyProps = profiles[currentUserId].notify_props;

        if (updateRequest.status === RequestStatus.FAILURE) {
            throw new Error(JSON.stringify(updateRequest.error));
        }

        assert.equal(updateNotifyProps.comments, 'any');
        assert.equal(updateNotifyProps.email, 'false');
        assert.equal(updateNotifyProps.first_name, 'false');
        assert.equal(updateNotifyProps.mention_keys, '');
    });

    it('patchUser', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, TestHelper.basicUser.password)(store.dispatch, store.getState);

        const state = store.getState();
        const currentUserId = state.entities.users.currentUserId;
        const currentUser = state.entities.users.profiles[currentUserId];
        const notifyProps = currentUser.notify_props;

        nock(Client4.getBaseRoute()).
            put(`/users/${currentUserId}/patch`).
            query(true).
            reply(200, {
                ...currentUser,
                notify_props: {
                    ...notifyProps,
                    comments: 'any',
                    email: 'false',
                    first_name: 'false',
                    mention_keys: '',
                    user_id: currentUser.id,
                },
            });

        await Actions.patchUser({
            id: currentUserId,
            notify_props: {
                ...notifyProps,
                comments: 'any',
                email: 'false',
                first_name: 'false',
                mention_keys: '',
                user_id: currentUser.id,
            },
        })(store.dispatch, store.getState);

        const {profiles} = store.getState().entities.users;
        const updateNotifyProps = profiles[currentUserId].notify_props;

        assert.equal(updateNotifyProps.comments, 'any');
        assert.equal(updateNotifyProps.email, 'false');
        assert.equal(updateNotifyProps.first_name, 'false');
        assert.equal(updateNotifyProps.mention_keys, '');
    });

    it('updateUserRoles', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            put(`/users/${currentUserId}/roles`).
            reply(200, OK_RESPONSE);

        await Actions.updateUserRoles(currentUserId, 'system_user system_admin')(store.dispatch, store.getState);

        const {profiles} = store.getState().entities.users;
        const currentUserRoles = profiles[currentUserId].roles;

        assert.equal(currentUserRoles, 'system_user system_admin');
    });

    it('updateUserMfa', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            put(`/users/${currentUserId}/mfa`).
            reply(200, OK_RESPONSE);

        await Actions.updateUserMfa(currentUserId, false, '')(store.dispatch, store.getState);

        const {profiles} = store.getState().entities.users;
        const currentUserMfa = profiles[currentUserId].mfa_active;

        assert.equal(currentUserMfa, false);
    });

    it('updateUserPassword', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const beforeTime = new Date().getTime();
        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            put(`/users/${currentUserId}/password`).
            reply(200, OK_RESPONSE);

        await Actions.updateUserPassword(currentUserId, 'password1', 'password1')(store.dispatch, store.getState);

        const {profiles} = store.getState().entities.users;
        const currentUser = profiles[currentUserId];

        assert.ok(currentUser);
        assert.ok(currentUser.last_password_update_at > beforeTime);
    });

    it('checkMfa', async () => {
        const user = TestHelper.basicUser;

        nock(Client4.getBaseRoute()).
            post('/users/mfa').
            reply(200, {mfa_required: false});

        const {data: mfaRequired} = await Actions.checkMfa(user.email)(store.dispatch, store.getState);

        const state = store.getState();
        const mfaRequest = state.requests.users.checkMfa;

        if (mfaRequest.status === RequestStatus.FAILURE) {
            throw new Error(JSON.stringify(mfaRequest.error));
        }

        assert.ok(!mfaRequired);
    });

    it('generateMfaSecret', async () => {
        const response = {secret: 'somesecret', qr_code: 'someqrcode'};

        nock(Client4.getBaseRoute()).
            post('/users/me/mfa/generate').
            reply(200, response);

        const {data} = await Actions.generateMfaSecret('me')(store.dispatch, store.getState);

        assert.deepEqual(data, response);
    });

    it('updateUserActive', async () => {
        nock(Client4.getBaseRoute()).
            post('/users').
            reply(200, TestHelper.fakeUserWithId());

        const {data: user} = await Actions.createUser(TestHelper.fakeUser())(store.dispatch, store.getState);

        const beforeTime = new Date().getTime();

        nock(Client4.getBaseRoute()).
            put(`/users/${user.id}/active`).
            reply(200, OK_RESPONSE);
        await Actions.updateUserActive(user.id, false)(store.dispatch, store.getState);

        const {profiles} = store.getState().entities.users;

        assert.ok(profiles[user.id]);
        assert.ok(profiles[user.id].delete_at > beforeTime);
    });

    it('verifyUserEmail', async () => {
        nock(Client4.getBaseRoute()).
            post('/users/email/verify').
            reply(200, OK_RESPONSE);

        const {data} = await Actions.verifyUserEmail('sometoken')(store.dispatch, store.getState);

        assert.deepEqual(data, OK_RESPONSE);
    });

    it('sendVerificationEmail', async () => {
        nock(Client4.getBaseRoute()).
            post('/users/email/verify/send').
            reply(200, OK_RESPONSE);

        const {data} = await Actions.sendVerificationEmail(TestHelper.basicUser.email)(store.dispatch, store.getState);

        assert.deepEqual(data, OK_RESPONSE);
    });

    it('resetUserPassword', async () => {
        nock(Client4.getBaseRoute()).
            post('/users/password/reset').
            reply(200, OK_RESPONSE);

        const {data} = await Actions.resetUserPassword('sometoken', 'newpassword')(store.dispatch, store.getState);

        assert.deepEqual(data, OK_RESPONSE);
    });

    it('sendPasswordResetEmail', async () => {
        nock(Client4.getBaseRoute()).
            post('/users/password/reset/send').
            reply(200, OK_RESPONSE);

        const {data} = await Actions.sendPasswordResetEmail(TestHelper.basicUser.email)(store.dispatch, store.getState);

        assert.deepEqual(data, OK_RESPONSE);
    });

    it('uploadProfileImage', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const testImageData = fs.createReadStream('test/assets/images/test.png');

        const beforeTime = new Date().getTime();
        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            post(`/users/${TestHelper.basicUser.id}/image`).
            reply(200, OK_RESPONSE);

        await Actions.uploadProfileImage(currentUserId, testImageData)(store.dispatch, store.getState);

        const {profiles} = store.getState().entities.users;
        const currentUser = profiles[currentUserId];

        assert.ok(currentUser);
        assert.ok(currentUser.last_picture_update > beforeTime);
    });

    it('setDefaultProfileImage', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            delete(`/users/${TestHelper.basicUser.id}/image`).
            reply(200, OK_RESPONSE);

        await Actions.setDefaultProfileImage(currentUserId)(store.dispatch, store.getState);

        const {profiles} = store.getState().entities.users;
        const currentUser = profiles[currentUserId];

        assert.ok(currentUser);
        assert.equal(currentUser.last_picture_update, 0);
    });

    it('switchEmailToOAuth', async () => {
        nock(Client4.getBaseRoute()).
            post('/users/login/switch').
            reply(200, {follow_link: '/login'});

        const {data} = await Actions.switchEmailToOAuth('gitlab', TestHelper.basicUser.email, TestHelper.basicUser.password)(store.dispatch, store.getState);
        assert.deepEqual(data, {follow_link: '/login'});
    });

    it('switchOAuthToEmail', async () => {
        nock(Client4.getBaseRoute()).
            post('/users/login/switch').
            reply(200, {follow_link: '/login'});

        const {data} = await Actions.switchOAuthToEmail('gitlab', TestHelper.basicUser.email, TestHelper.basicUser.password)(store.dispatch, store.getState);

        assert.deepEqual(data, {follow_link: '/login'});
    });

    it('switchEmailToLdap', async () => {
        nock(Client4.getBaseRoute()).
            post('/users/login/switch').
            reply(200, {follow_link: '/login'});

        const {data} = await Actions.switchEmailToLdap(TestHelper.basicUser.email, TestHelper.basicUser.password, 'someid', 'somepassword')(store.dispatch, store.getState);

        assert.deepEqual(data, {follow_link: '/login'});
    });

    it('switchLdapToEmail', (done) => {
        async function test() {
            nock(Client4.getBaseRoute()).
                post('/users/login/switch').
                reply(200, {follow_link: '/login'});

            const {data} = await Actions.switchLdapToEmail('somepassword', TestHelper.basicUser.email, TestHelper.basicUser.password)(store.dispatch, store.getState);
            assert.deepEqual(data, {follow_link: '/login'});

            done();
        }

        test();
    });

    it('createUserAccessToken', (done) => {
        async function test() {
            TestHelper.mockLogin();
            await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

            const currentUserId = store.getState().entities.users.currentUserId;

            nock(Client4.getBaseRoute()).
                post(`/users/${currentUserId}/tokens`).
                reply(201, {id: 'someid', token: 'sometoken', description: 'test token', user_id: currentUserId});

            const {data} = await Actions.createUserAccessToken(currentUserId, 'test token')(store.dispatch, store.getState);

            const {myUserAccessTokens} = store.getState().entities.users;

            assert.ok(myUserAccessTokens);
            assert.ok(myUserAccessTokens[data.id]);
            assert.ok(!myUserAccessTokens[data.id].token);
            done();
        }

        test();
    });

    it('getUserAccessToken', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            post(`/users/${currentUserId}/tokens`).
            reply(201, {id: 'someid', token: 'sometoken', description: 'test token', user_id: currentUserId});

        const {data} = await Actions.createUserAccessToken(currentUserId, 'test token')(store.dispatch, store.getState);

        nock(Client4.getBaseRoute()).
            get(`/users/tokens/${data.id}`).
            reply(200, {id: data.id, description: 'test token', user_id: currentUserId});

        await Actions.getUserAccessToken(data.id)(store.dispatch, store.getState);

        const {myUserAccessTokens} = store.getState().entities.users;

        assert.ok(myUserAccessTokens);
        assert.ok(myUserAccessTokens[data.id]);
        assert.ok(!myUserAccessTokens[data.id].token);
    });

    it('getUserAccessTokens', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            post(`/users/${currentUserId}/tokens`).
            reply(201, {id: 'someid', token: 'sometoken', description: 'test token', user_id: currentUserId});

        const {data} = await Actions.createUserAccessToken(currentUserId, 'test token')(store.dispatch, store.getState);

        nock(Client4.getBaseRoute()).
            get('/users/tokens').
            query(true).
            reply(200, [{id: data.id, description: 'test token', user_id: currentUserId}]);

        await Actions.getUserAccessTokens()(store.dispatch, store.getState);

        const {myUserAccessTokens} = store.getState().entities.users;

        assert.ok(myUserAccessTokens);
        assert.ok(myUserAccessTokens[data.id]);
        assert.ok(!myUserAccessTokens[data.id].token);
    });

    it('getUserAccessTokensForUser', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            post(`/users/${currentUserId}/tokens`).
            reply(201, {id: 'someid', token: 'sometoken', description: 'test token', user_id: currentUserId});

        const {data} = await Actions.createUserAccessToken(currentUserId, 'test token')(store.dispatch, store.getState);

        nock(Client4.getBaseRoute()).
            get(`/users/${currentUserId}/tokens`).
            query(true).
            reply(200, [{id: data.id, description: 'test token', user_id: currentUserId}]);

        await Actions.getUserAccessTokensForUser(currentUserId)(store.dispatch, store.getState);

        const {myUserAccessTokens} = store.getState().entities.users;

        assert.ok(myUserAccessTokens);
        assert.ok(myUserAccessTokens[data.id]);
        assert.ok(!myUserAccessTokens[data.id].token);
    });

    it('revokeUserAccessToken', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            post(`/users/${currentUserId}/tokens`).
            reply(201, {id: 'someid', token: 'sometoken', description: 'test token', user_id: currentUserId});

        const {data} = await Actions.createUserAccessToken(currentUserId, 'test token')(store.dispatch, store.getState);

        let {myUserAccessTokens} = store.getState().entities.users;

        assert.ok(myUserAccessTokens);
        assert.ok(myUserAccessTokens[data.id]);
        assert.ok(!myUserAccessTokens[data.id].token);

        nock(Client4.getBaseRoute()).
            post('/users/tokens/revoke').
            reply(200, OK_RESPONSE);

        await Actions.revokeUserAccessToken(data.id)(store.dispatch, store.getState);

        myUserAccessTokens = store.getState().entities.users.myUserAccessTokens;

        assert.ok(myUserAccessTokens);
        assert.ok(!myUserAccessTokens[data.id]);
    });

    it('disableUserAccessToken', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            post(`/users/${currentUserId}/tokens`).
            reply(201, {id: 'someid', token: 'sometoken', description: 'test token', user_id: currentUserId});

        const {data} = await Actions.createUserAccessToken(currentUserId, 'test token')(store.dispatch, store.getState);
        const testId = data.id;

        let {myUserAccessTokens} = store.getState().entities.users;

        assert.ok(myUserAccessTokens);
        assert.ok(myUserAccessTokens[testId]);
        assert.ok(!myUserAccessTokens[testId].token);

        nock(Client4.getBaseRoute()).
            post('/users/tokens/disable').
            reply(200, OK_RESPONSE);

        await Actions.disableUserAccessToken(testId)(store.dispatch, store.getState);

        myUserAccessTokens = store.getState().entities.users.myUserAccessTokens;

        assert.ok(myUserAccessTokens);
        assert.ok(myUserAccessTokens[testId]);
        assert.ok(!myUserAccessTokens[testId].is_active);
        assert.ok(!myUserAccessTokens[testId].token);
    });

    it('enableUserAccessToken', async () => {
        TestHelper.mockLogin();
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            post(`/users/${currentUserId}/tokens`).
            reply(201, {id: 'someid', token: 'sometoken', description: 'test token', user_id: currentUserId});

        const {data} = await Actions.createUserAccessToken(currentUserId, 'test token')(store.dispatch, store.getState);
        const testId = data.id;

        let {myUserAccessTokens} = store.getState().entities.users;

        assert.ok(myUserAccessTokens);
        assert.ok(myUserAccessTokens[testId]);
        assert.ok(!myUserAccessTokens[testId].token);

        nock(Client4.getBaseRoute()).
            post('/users/tokens/enable').
            reply(200, OK_RESPONSE);

        await Actions.enableUserAccessToken(testId)(store.dispatch, store.getState);

        myUserAccessTokens = store.getState().entities.users.myUserAccessTokens;

        assert.ok(myUserAccessTokens);
        assert.ok(myUserAccessTokens[testId]);
        assert.ok(myUserAccessTokens[testId].is_active);
        assert.ok(!myUserAccessTokens[testId].token);
    });

    it('clearUserAccessTokens', async () => {
        await Actions.login(TestHelper.basicUser.email, 'password1')(store.dispatch, store.getState);

        const currentUserId = store.getState().entities.users.currentUserId;

        nock(Client4.getBaseRoute()).
            post(`/users/${currentUserId}/tokens`).
            reply(201, {id: 'someid', token: 'sometoken', description: 'test token', user_id: currentUserId});

        await Actions.createUserAccessToken(currentUserId, 'test token')(store.dispatch, store.getState);

        await Actions.clearUserAccessTokens()(store.dispatch, store.getState);

        const {myUserAccessTokens} = store.getState().entities.users;

        assert.ok(Object.values(myUserAccessTokens).length === 0);
    });

    describe('checkForModifiedUsers', () => {
        test('should request users by IDs that have changed since the last websocket disconnect', async () => {
            const lastDisconnectAt = 1500;

            const user1 = {id: 'user1', update_at: 1000};
            const user2 = {id: 'user2', update_at: 1000};

            nock(Client4.getBaseRoute()).
                post('/users/ids').
                query({since: lastDisconnectAt}).
                reply(200, [{...user2, update_at: 2000}]);

            store = await configureStore({
                entities: {
                    general: {
                        serverVersion: '5.14.0',
                    },
                    users: {
                        profiles: {
                            user1,
                            user2,
                        },
                    },
                },
                websocket: {
                    lastDisconnectAt,
                },
            });

            await store.dispatch(Actions.checkForModifiedUsers());

            const profiles = store.getState().entities.users.profiles;
            expect(profiles.user1).toBe(user1);
            expect(profiles.user2).not.toBe(user2);
            expect(profiles.user2).toEqual({id: 'user2', update_at: 2000});
        });

        test('should do nothing on older servers', async () => {
            const lastDisconnectAt = 1500;
            const originalState = deepFreeze({
                entities: {
                    general: {
                        serverVersion: '5.13.0',
                    },
                    users: {
                        profiles: {},
                    },
                },
                websocket: {
                    lastDisconnectAt,
                },
            });

            store = await configureStore(originalState);

            await store.dispatch(Actions.checkForModifiedUsers());

            const profiles = store.getState().entities.users.profiles;
            expect(profiles).toBe(originalState.entities.users.profiles);
        });
    });
});
