// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import * as reselect from 'reselect';

import {getCurrentTeamId} from '@mm-redux/selectors/entities/teams';

import * as types from '@mm-redux/types';

export const getCurrentSearchForCurrentTeam = reselect.createSelector(
    (state: types.store.GlobalState) => state.entities.search.current,
    getCurrentTeamId,
    (current, teamId) => {
        return current[teamId];
    },
);
