// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import merge from 'deepmerge';

function transformFromSet(incoming) {
    const state = {...incoming};

    for (const key in state) {
        if (state.hasOwnProperty(key)) {
            if (state[key] instanceof Set) {
                state[key] = Array.from([...state[key]]);
            }
        }
    }

    return state;
}

function transformToSet(incoming) {
    const state = {...incoming};

    for (const key in state) {
        if (state.hasOwnProperty(key)) {
            state[key] = new Set(state[key]);
        }
    }

    return state;
}

export function transformSet(incoming, setTransforms, toStorage = true) {
    const state = {...incoming};

    const transformer = toStorage ? transformFromSet : transformToSet;

    for (const key in state) {
        if (state.hasOwnProperty(key) && setTransforms.includes(key)) {
            state[key] = transformer(state[key]);
        }
    }

    return state;
}

export function waitForHydration(store, callback) {
    let executed = false; // this is to prevent a race condition when subcription runs before unsubscribed
    if (store.getState().views?.root?.hydrationComplete && !executed) {
        if (callback && typeof callback === 'function') {
            executed = true;
            callback();
        }
    } else {
        const subscription = () => {
            if (store.getState().views?.root?.hydrationComplete && !executed) {
                unsubscribeFromStore();
                if (callback && typeof callback === 'function') {
                    executed = true;
                    callback();
                }
            }
        };

        const unsubscribeFromStore = store.subscribe(subscription);
    }
}

export function getStateForReset(initialState, currentState) {
    const {currentUserId} = currentState.entities.users;
    const currentUserProfile = currentState.entities.users.profiles[currentUserId];
    const {currentTeamId} = currentState.entities.teams;
    const preferences = currentState.entities.preferences;

    const resetState = merge(initialState, {
        entities: {
            general: currentState.entities.general,
            users: {
                currentUserId,
                profiles: {
                    [currentUserId]: currentUserProfile,
                },
            },
            teams: {
                currentTeamId,
            },
            preferences,
        },
        errors: currentState.errors,
        views: {
            selectServer: {
                serverUrl: currentState.views?.selectServer?.serverUrl,
            },
            root: {
                hydrationComplete: true,
            },
        },
    });

    return resetState;
}
