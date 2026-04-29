import { Modal, App } from 'obsidian';

export class LogsModal extends Modal {
    logLines: string[];

    constructor(logLines: string[], app: App) {
        super(app);
        this.logLines = logLines;
    }

    onOpen(): void {
        let { contentEl } = this;

        // Header
        const headerWrapper = contentEl.createDiv();
        headerWrapper.addClass('unused-images-center-wrapper');
        const headerEl = headerWrapper.createEl('h1', { text: 'Clear unused images plus - logs' });
        headerEl.addClass('modal-title');

        // Information to show
        const logs = contentEl.createDiv();
        logs.addClass('unused-images-logs');
        for (const line of this.logLines) {
            const lineEl = logs.createDiv();
            lineEl.setText(line);
        }

        // Close Button
        const buttonWrapper = contentEl.createDiv();
        buttonWrapper.addClass('unused-images-center-wrapper');
        const closeButton = buttonWrapper.createEl('button', { text: 'Close' });
        closeButton.addClass('unused-images-button');
        closeButton.addEventListener('click', () => {
            this.close();
        });
    }
}
