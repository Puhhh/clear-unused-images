import { App, Modal } from 'obsidian';

export class CleanupReviewModal extends Modal {
    private readonly filePaths: string[];
    private resolveDecision: ((decision: boolean) => void) | undefined;
    private decisionResolved = false;

    constructor(app: App, filePaths: string[]) {
        super(app);
        this.filePaths = filePaths;
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
        headerWrapper.createEl('h1', { text: 'Review unused files' }).addClass('modal-title');

        contentEl.createEl('p', {
            text: 'These files are about to be processed by clear unused attachments. Review the exact paths before continuing.',
        });

        const listWrapper = contentEl.createDiv();
        listWrapper.addClass('unused-images-logs');
        for (const filePath of this.filePaths) {
            listWrapper.createDiv({ text: filePath });
        }

        const buttonWrapper = contentEl.createDiv();
        buttonWrapper.addClass('unused-images-center-wrapper');

        const cancelButton = buttonWrapper.createEl('button', { text: 'Cancel' });
        cancelButton.addClass('unused-images-button');
        cancelButton.addEventListener('click', () => {
            this.closeWithDecision(false);
        });

        const continueButton = buttonWrapper.createEl('button', { text: 'Continue' });
        continueButton.addClass('unused-images-button');
        continueButton.addEventListener('click', () => {
            this.closeWithDecision(true);
        });
    }

    onClose() {
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
