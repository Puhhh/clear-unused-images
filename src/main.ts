import { App, Modal, Notice, Plugin, TFile } from 'obsidian';
import { OzanClearImagesSettingsTab } from './settings';
import { OzanClearImagesSettings, DEFAULT_SETTINGS } from './settings';
import { LogsModal } from './modals';
import { CleanupReviewModal } from './reviewModal';
import * as Util from './util';
import { createPeriodicCleanupScheduler, createVaultLoadCleanupScheduler } from './startupCleanup';

export default class OzanClearImages extends Plugin {
    settings: OzanClearImagesSettings;
    ribbonIconEl: HTMLElement | undefined = undefined;
    startupCleanupScheduled = false;
    periodicCleanupTimerId: number | undefined = undefined;
    periodicCleanupScheduler: ReturnType<typeof createPeriodicCleanupScheduler<number>> | undefined = undefined;
    cleanupInProgress = false;
    private vaultLayoutReady = false;
    private vaultMetadataResolved = false;
    private vaultReadyCallbacks: Array<() => void | Promise<void>> = [];
    private vaultReadyListenersRegistered = false;

    onload(): void {
        void this.initializePlugin();
    }

    private async initializePlugin(): Promise<void> {
        this.addSettingTab(new OzanClearImagesSettingsTab(this.app, this));
        await this.loadSettings();
        this.addCommand({
            id: 'clear-images-obsidian',
            name: 'Clear unused images',
            callback: () => {
                void this.clearUnusedAttachments('image');
            },
        });
        this.addCommand({
            id: 'clear-unused-attachments',
            name: 'Clear unused attachments',
            callback: () => {
                void this.clearUnusedAttachments('all');
            },
        });
        this.refreshIconRibbon();
        this.scheduleVaultLoadCleanup();
        this.refreshPeriodicCleanup();
    }

    onunload() {
        this.clearPeriodicCleanupTimer();
    }

    async loadSettings() {
        const loadedSettings: unknown = await this.loadData();
        const settingsOverride = isSettingsOverride(loadedSettings) ? loadedSettings : {};
        this.settings = { ...DEFAULT_SETTINGS, ...settingsOverride };
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    refreshIconRibbon = () => {
        this.ribbonIconEl?.remove();
        if (this.settings.ribbonIcon) {
            this.ribbonIconEl = this.addRibbonIcon('image-file', 'Clear unused images', (): void => {
                void this.clearUnusedAttachments('image');
            });
        }
    };

    scheduleVaultLoadCleanup(): void {
        if (this.startupCleanupScheduled) {
            return;
        }

        this.startupCleanupScheduled = true;
        const scheduleCleanup = createVaultLoadCleanupScheduler(
            (callback) => this.onVaultReady(callback),
            async (type) => {
                await this.clearUnusedAttachments(type);
            }
        );

        void scheduleCleanup(this.settings.autoCleanOnVaultLoad);
    }

    refreshPeriodicCleanup(): void {
        if (!this.periodicCleanupScheduler) {
            this.periodicCleanupScheduler = createPeriodicCleanupScheduler<number>(
                (callback) => this.onVaultReady(callback),
                (callback, intervalMs) => {
                    this.clearPeriodicCleanupTimer();
                    const timerId = window.setInterval(callback, intervalMs);
                    this.periodicCleanupTimerId = timerId;
                    return timerId;
                },
                (timerId) => {
                    window.clearInterval(timerId);
                    if (this.periodicCleanupTimerId === timerId) {
                        this.periodicCleanupTimerId = undefined;
                    }
                },
                async (type) => {
                    await this.clearUnusedAttachments(type);
                }
            );
        }

        this.periodicCleanupScheduler({
            enabled: this.settings.autoCleanEveryXMinutes,
            intervalMinutes: this.settings.autoCleanIntervalMinutes,
            canRunCleanup: () => {
                if (this.settings.deleteOption === 'permanent') {
                    return false;
                }

                return true;
            },
        });

        if (this.settings.autoCleanEveryXMinutes && this.settings.deleteOption === 'permanent') {
            new Notice('Periodic cleanup is disabled while permanently delete is selected.');
        }
    }

    onVaultReady(callback: () => void | Promise<void>): void {
        this.ensureVaultReadyListeners();

        if (this.vaultLayoutReady && this.vaultMetadataResolved) {
            void callback();
            return;
        }

        this.vaultReadyCallbacks.push(callback);
    }

    private ensureVaultReadyListeners(): void {
        if (this.vaultReadyListenersRegistered) {
            return;
        }

        this.vaultReadyListenersRegistered = true;
        this.vaultLayoutReady = this.app.workspace.layoutReady;
        this.vaultMetadataResolved = Object.keys(this.app.metadataCache.resolvedLinks).length > 0;

        this.app.workspace.onLayoutReady(() => {
            this.vaultLayoutReady = true;
            this.flushVaultReadyCallbacks();
        });

        this.registerEvent(
            this.app.metadataCache.on('resolved', () => {
                this.vaultMetadataResolved = true;
                this.flushVaultReadyCallbacks();
            })
        );

        this.flushVaultReadyCallbacks();
    }

    private flushVaultReadyCallbacks(): void {
        if (!this.vaultLayoutReady || !this.vaultMetadataResolved || this.vaultReadyCallbacks.length === 0) {
            return;
        }

        const callbacks = this.vaultReadyCallbacks.splice(0, this.vaultReadyCallbacks.length);
        for (const callback of callbacks) {
            void callback();
        }
    }

    clearPeriodicCleanupTimer(): void {
        if (this.periodicCleanupTimerId !== undefined) {
            window.clearInterval(this.periodicCleanupTimerId);
            this.periodicCleanupTimerId = undefined;
        }
    }

    // Compare Used Images with all images and return unused ones
    clearUnusedAttachments = async (
        type: 'all' | 'image',
        options: { silentIfBusy?: boolean } = {}
    ) => {
        if (this.cleanupInProgress) {
            if (!options.silentIfBusy) {
                new Notice('Cleanup is already running.');
            }
            return;
        }

        this.cleanupInProgress = true;
        try {
            const unusedAttachments: TFile[] = await Util.getUnusedAttachments(this.app, type);
            const len = unusedAttachments.length;
            if (len > 0) {
                if (type === 'all') {
                    const reviewAccepted = await new CleanupReviewModal(
                        this.app,
                        unusedAttachments.map((file) => file.path)
                    ).prompt();
                    if (!reviewAccepted) {
                        new Notice('Cleanup cancelled.');
                        return;
                    }
                }

                if (this.settings.deleteOption === 'permanent' && !(await this.confirmPermanentDelete(len, type))) {
                    new Notice('Cleanup cancelled.');
                    return;
                }

                let logs: string[] = [];
                logs.push(`[+] ${Util.getFormattedDate()}: Clearing started.`);

                const { deletedImages, skippedImages, failedImages, logLines } = await Util.deleteFilesInTheList(
                    unusedAttachments,
                    this,
                    this.app
                );

                logs.push(...logLines);
                logs.push(`[+] ${deletedImages.toString()} ${type === 'image' ? 'image(s)' : 'attachment(s)'} deleted.`);
                if (skippedImages > 0) {
                    logs.push(`[=] ${skippedImages.toString()} excluded file(s) skipped.`);
                }
                if (failedImages > 0) {
                    logs.push(`[!] ${failedImages.toString()} file(s) failed to delete.`);
                }
                logs.push(`[+] ${Util.getFormattedDate()}: Clearing completed.`);

                if (failedImages > 0) {
                    new Notice(`Cleanup finished with ${failedImages.toString()} deletion error(s). Check logs.`);
                } else if (deletedImages > 0) {
                    new Notice(`Deleted ${deletedImages.toString()} unused ${type === 'image' ? 'image(s)' : 'attachment(s)'}.`);
                }

                if (this.settings.logsModal || failedImages > 0) {
                    const modal = new LogsModal(logs, this.app);
                    modal.open();
                }
            } else {
                new Notice(`All ${type === 'image' ? 'images' : 'attachments'} are used. Nothing was deleted.`);
            }
        } catch (error) {
            console.error('Clear unused attachments failed.', error);
            new Notice(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.cleanupInProgress = false;
        }
    };

    confirmPermanentDelete(len: number, type: 'all' | 'image'): Promise<boolean> {
        return new PermanentDeleteConfirmationModal(this.app, len, type).prompt();
    }
}

const isSettingsOverride = (value: unknown): value is Partial<OzanClearImagesSettings> => {
    return typeof value === 'object' && value !== null;
};

class PermanentDeleteConfirmationModal extends Modal {
    private readonly message: string;
    private resolveDecision: ((decision: boolean) => void) | undefined;
    private decisionResolved = false;

    constructor(app: App, len: number, type: 'all' | 'image') {
        super(app);
        this.message = `Permanently delete ${len.toString()} unused ${
            type === 'image' ? 'image(s)' : 'attachment(s)'
        }? This cannot be undone.`;
    }

    prompt(): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            this.resolveDecision = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        const headerWrapper = contentEl.createDiv();
        headerWrapper.addClass('unused-images-center-wrapper');
        headerWrapper.createEl('h1', { text: 'Confirm permanent delete' }).addClass('modal-title');

        contentEl.createEl('p', { text: this.message });

        const buttonWrapper = contentEl.createDiv();
        buttonWrapper.addClass('unused-images-center-wrapper');

        const cancelButton = buttonWrapper.createEl('button', { text: 'Cancel' });
        cancelButton.addClass('unused-images-button');
        cancelButton.addEventListener('click', () => {
            this.closeWithDecision(false);
        });

        const deleteButton = buttonWrapper.createEl('button', { text: 'Delete permanently' });
        deleteButton.addClass('unused-images-button');
        deleteButton.addEventListener('click', () => {
            this.closeWithDecision(true);
        });
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.decisionResolved) {
            this.decisionResolved = true;
            this.resolveDecision?.(false);
        }
    }

    private closeWithDecision(decision: boolean): void {
        if (this.decisionResolved) {
            return;
        }

        this.decisionResolved = true;
        this.resolveDecision?.(decision);
        this.close();
    }
}
