import { App, TFile } from 'obsidian';
import OzanClearImages from './main';
import { getAllLinkMatchesInFile, LinkMatch } from './linkDetector';
import {
    IMAGE_EXTENSIONS,
    hasImageExtension,
    isPathCoveredByExcludedFolder,
    resolveVaultAttachmentReference,
    splitExcludedFolders,
} from './referenceUtils';
import { walkFrontmatterValues } from './frontmatterWalker';

/* ------------------ Image Handlers  ------------------ */

const bannerRegex = /!\[\[(.*?)\]\]/i;

interface CanvasFileNode {
    type: 'file';
    file: string;
}

interface CanvasTextNode {
    type: 'text';
    text: string;
}

interface CanvasData {
    nodes?: Array<CanvasFileNode | CanvasTextNode | Record<string, unknown>>;
}

// Create the List of Unused Images
export const getUnusedAttachments = async (app: App, type: 'image' | 'all') => {
    const allAttachmentsInVault: TFile[] = getAttachmentsInVault(app, type);
    const unusedAttachments: TFile[] = [];

    // Get Used Attachments in All Markdown Files
    const usedAttachmentsSet = await getAttachmentPathSetForVault(app, type);

    // Compare All Attachments vs Used Attachments
    allAttachmentsInVault.forEach((attachment) => {
        if (!usedAttachmentsSet.has(attachment.path)) unusedAttachments.push(attachment);
    });

    return unusedAttachments;
};

// Getting all available images saved in vault
const getAttachmentsInVault = (app: App, type: 'image' | 'all'): TFile[] => {
    let allFiles: TFile[] = app.vault.getFiles();
    let attachments: TFile[] = [];
    for (let i = 0; i < allFiles.length; i++) {
        if (!['md', 'canvas'].includes(allFiles[i].extension)) {
            // Only images
            if (IMAGE_EXTENSIONS.has(allFiles[i].extension.toLowerCase())) {
                attachments.push(allFiles[i]);
            }
            // All Files
            else if (type === 'all') {
                attachments.push(allFiles[i]);
            }
        }
    }
    return attachments;
};

// New Method for Getting All Used Attachments
const getAttachmentPathSetForVault = async (app: App, type: 'image' | 'all'): Promise<Set<string>> => {
    const attachmentsSet: Set<string> = new Set();
    const resolvedLinks: Record<string, Record<string, number>> = app.metadataCache.resolvedLinks;
    if (resolvedLinks) {
        for (const links of Object.values(resolvedLinks)) {
            for (const filePath of Object.keys(links)) {
                if (!filePath.endsWith('.md')) {
                    attachmentsSet.add(filePath);
                }
            }
        }
    }
    // Loop Files and Check Frontmatter/Canvas
    const allFiles = app.vault.getFiles();
    for (let i = 0; i < allFiles.length; i++) {
        const obsFile = allFiles[i];
        // Check Frontmatter for md files and additional links that might be missed in resolved links
        if (obsFile.extension === 'md') {
            // Frontmatter
            const fileCache = app.metadataCache.getFileCache(obsFile);
            if (fileCache.frontmatter) {
                collectFrontmatterAttachmentReferences(fileCache.frontmatter, app, obsFile.path, attachmentsSet, type);
            }
            // Any Additional Link
            const linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(obsFile, app);
            for (const linkMatch of linkMatches) {
                addToSet(attachmentsSet, linkMatch.linkText);
            }
        }
        // Check Canvas for links
        else if (obsFile.extension === 'canvas') {
            const fileRead = await app.vault.cachedRead(obsFile);
            try {
                const canvasData = JSON.parse(fileRead) as CanvasData;
                if (Array.isArray(canvasData.nodes) && canvasData.nodes.length > 0) {
                    for (const node of canvasData.nodes) {
                        // node.type: 'text' | 'file'
                        if (isCanvasFileNode(node)) {
                            addToSet(attachmentsSet, node.file);
                        } else if (isCanvasTextNode(node)) {
                            const linkMatches: LinkMatch[] = await getAllLinkMatchesInFile(obsFile, app, node.text);
                            for (const linkMatch of linkMatches) {
                                addToSet(attachmentsSet, linkMatch.linkText);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(`Failed to parse canvas file: ${obsFile.path}`, error);
            }
        }
    }
    return attachmentsSet;
};

/* ------------------ Deleting Handlers  ------------------ */

// Clear Images From the Provided List
export const deleteFilesInTheList = async (
    fileList: TFile[],
    plugin: OzanClearImages,
    app: App
): Promise<{ deletedImages: number; skippedImages: number; failedImages: number; logLines: string[] }> => {
    const deleteOption = plugin.settings.deleteOption;
    let deletedImages = 0;
    let skippedImages = 0;
    let failedImages = 0;
    const logLines: string[] = [];
    for (const file of fileList) {
        if (fileIsInExcludedFolder(file, plugin)) {
            skippedImages++;
            logLines.push(`[=] Skipped excluded file: ${file.path}`);
        } else {
            try {
                let deleted = false;
                if (deleteOption === '.trash') {
                    await app.vault.trash(file, false);
                    logLines.push(`[+] Moved to Obsidian Trash: ${file.path}`);
                    deleted = true;
                } else if (deleteOption === 'system-trash') {
                    await app.vault.trash(file, true);
                    logLines.push(`[+] Moved to System Trash: ${file.path}`);
                    deleted = true;
                } else if (deleteOption === 'permanent') {
                    await app.vault.delete(file);
                    logLines.push(`[+] Deleted Permanently: ${file.path}`);
                    deleted = true;
                } else {
                    throw new Error(`Unsupported delete option: ${deleteOption}`);
                }

                if (deleted) {
                    deletedImages++;
                }
            } catch (error) {
                failedImages++;
                logLines.push(`[!] Failed to delete ${file.path}: ${getErrorMessage(error)}`);
            }
        }
    }
    return { deletedImages, skippedImages, failedImages, logLines };
};

// Check if File is Under Excluded Folders
const fileIsInExcludedFolder = (file: TFile, plugin: OzanClearImages): boolean => {
    const excludedFoldersSettings = plugin.settings.excludedFolders;
    const excludeSubfolders = plugin.settings.excludeSubfolders;
    if (excludedFoldersSettings === '') {
        return false;
    } else {
        // Get All Excluded Folder Paths
        const excludedFolderPaths = splitExcludedFolders(excludedFoldersSettings);

        if (excludeSubfolders) {
            // If subfolders included, check if any provided path covers the current folder path
            for (const exludedFolderPath of excludedFolderPaths) {
                if (isPathCoveredByExcludedFolder(file.parent.path, exludedFolderPath, true)) {
                    return true;
                }
            }
        } else {
            // Full path of parent should match if subfolders are not included
            for (const exludedFolderPath of excludedFolderPaths) {
                if (isPathCoveredByExcludedFolder(file.parent.path, exludedFolderPath, false)) {
                    return true;
                }
            }
        }

        return false;
    }
};

/* ------------------ Helpers  ------------------ */

export const getFormattedDate = () => {
    const dt = new Date();
    return dt.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const addToSet = (setObj: Set<string>, value: string) => {
    if (!setObj.has(value)) {
        setObj.add(value);
    }
};

const isCanvasFileNode = (node: CanvasData['nodes'][number]): node is CanvasFileNode => {
    return node.type === 'file' && typeof node.file === 'string';
};

const isCanvasTextNode = (node: CanvasData['nodes'][number]): node is CanvasTextNode => {
    return node.type === 'text' && typeof node.text === 'string';
};

const resolveAttachmentReference = (
    app: App,
    reference: string,
    sourcePath: string,
    type: 'image' | 'all'
): string | null => {
    return resolveVaultAttachmentReference(
        reference,
        sourcePath,
        (referencePath, sourceFilePath) => {
            const file = app.metadataCache.getFirstLinkpathDest(referencePath, sourceFilePath);
            return file ? file.path : null;
        },
        (referencePath) => {
            const file = app.vault.getAbstractFileByPath(referencePath);
            if (!(file instanceof TFile)) {
                return false;
            }

            if (type === 'image') {
                return hasImageExtension(file.path);
            }

            return file.extension !== 'md' && file.extension !== 'canvas';
        },
        type
    );
};

const collectFrontmatterAttachmentReferences = (
    frontmatterValue: unknown,
    app: App,
    sourcePath: string,
    attachmentsSet: Set<string>,
    type: 'image' | 'all'
) => {
    walkFrontmatterValues(frontmatterValue, (stringValue) => {
        const bannerMatch = stringValue.match(bannerRegex);
        if (bannerMatch) {
            const fileName = bannerMatch[1];
            const file = app.metadataCache.getFirstLinkpathDest(fileName, sourcePath);
            if (file && (type === 'all' || hasImageExtension(file.path))) {
                addToSet(attachmentsSet, file.path);
            }
            return;
        }

        const resolvedPath = resolveAttachmentReference(app, stringValue, sourcePath, type);
        if (resolvedPath) {
            addToSet(attachmentsSet, resolvedPath);
        }
    });
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
        return error.toString();
    }

    return 'Unknown error';
};
