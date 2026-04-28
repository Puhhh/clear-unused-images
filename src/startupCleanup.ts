export const AUTO_CLEAN_ON_VAULT_LOAD_DEFAULT = false;

export type CleanupScope = 'all' | 'image';

export const createVaultLoadCleanupScheduler = (
    onVaultReady: (callback: () => void | Promise<void>) => void,
    runCleanup: (type: CleanupScope) => Promise<void>
) => {
    let alreadyScheduled = false;

    return async (enabled: boolean): Promise<void> => {
        if (!enabled || alreadyScheduled) {
            return;
        }

        alreadyScheduled = true;
        onVaultReady(() => runCleanup('image'));
    };
};
