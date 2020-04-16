// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console */

import MMKVStorage from 'react-native-mmkv-storage';

function checkValidInput(usedKey: string, value?: any) {
    const isValuePassed = arguments.length > 1;

    if (typeof usedKey !== 'string') {
        console.warn(
            `[MMKVStorageAdapter] Using ${typeof usedKey} type is not suppported. This can lead to unexpected behavior/errors. Use string instead.\nKey passed: ${usedKey}\n`,
        );
    }

    if (isValuePassed && typeof value !== 'object') {
        if (value == null) {
            throw new Error(
                `[MMKVStorageAdapter] Passing null/undefined as value is not supported. If you want to remove value, Use .remove method instead.\nPassed value: ${value}\nPassed key: ${usedKey}\n`,
            );
        } else {
            console.warn(
                `[MMKVStorageAdapter] The value for key "${usedKey}" is not a object. This can lead to unexpected behavior/errors. Consider JSON.parse it.\nPassed value: ${value}\nPassed key: ${usedKey}\n`,
            );
        }
    }
}

export default async function getStorage(identifier = 'default') {
    const MMKV = await new MMKVStorage.Loader().
        withInstanceID(identifier).
        setProcessingMode(MMKVStorage.MODES.MULTI_PROCESS).
        withEncryption().
        initialize();

    return {
        getItem: (
            key: string,
            callback?: (
                error: Error | null | undefined,
                result: object | null,
            ) => void | null | undefined,
        ): Promise<object | null> => {
            return new Promise((resolve, reject) => {
                checkValidInput(key);
                MMKV.getMapAsync(key).then((result: object) => {
                    if (callback) {
                        callback(null, result);
                    }
                    resolve(result);
                }).catch((error: Error) => {
                    if (callback) {
                        callback(null, error);
                    }
                    reject(error);
                });
            });
        },

        setItem: (
            key: string,
            value: object,
            callback?: (
                error: Error | null | undefined
            ) => void | null | undefined,
        ): Promise<null> => {
            return new Promise((resolve, reject) => {
                checkValidInput(key, value);
                MMKV.setMapAsync(key, value).then(() => {
                    if (callback) {
                        callback(null);
                    }
                    resolve(null);
                }).catch((error: Error) => {
                    if (callback) {
                        callback(error);
                    }
                    reject(error);
                });
            });
        },

        removeItem: (
            key: string,
            callback?: (
                error: Error | null | undefined
            ) => void | null | undefined,
        ): Promise<boolean> => {
            checkValidInput(key);
            if (callback) {
                callback(null);
            }

            return MMKV.removeItem(key);
        },
    };
}