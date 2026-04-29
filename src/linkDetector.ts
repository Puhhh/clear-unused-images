import { TFile, App } from 'obsidian';
import { extractMarkdownLinkMatches, parseMarkdownLinkDestination } from './referenceUtils';

/* -------------------- LINK DETECTOR -------------------- */

type LinkType = 'markdown' | 'wiki' | 'wikiTransclusion' | 'mdTransclusion';

export interface LinkMatch {
    type: LinkType;
    match: string;
    linkText: string;
    sourceFilePath: string;
}

/**
 *
 * @param mdFile : File, of which the text content is scanned
 * @param app : Obsidian App
 * @param fileText : Optional, If file is not Md format, provide fileText to scan
 * @returns Promise<LinkMatch[]>
 */
export const getAllLinkMatchesInFile = async (mdFile: TFile, app: App, fileText?: string): Promise<LinkMatch[]> => {
    const linkMatches: LinkMatch[] = [];
    if (fileText === undefined) {
        fileText = await app.vault.read(mdFile);
    }

    // --> Get All WikiLinks
    const wikiRegex = /\[\[.*?\]\]/g;
    const wikiMatches = fileText.match(wikiRegex);
    if (wikiMatches) {
        for (const wikiMatch of wikiMatches) {
            // --> Check if it is Transclusion
            if (matchIsWikiTransclusion(wikiMatch)) {
                const fileName = getTransclusionFileName(wikiMatch);
                const file = app.metadataCache.getFirstLinkpathDest(fileName, mdFile.path);
                if (fileName !== '') {
                    const linkMatch: LinkMatch = {
                        type: 'wikiTransclusion',
                        match: wikiMatch,
                        linkText: file ? file.path : fileName,
                        sourceFilePath: mdFile.path,
                    };
                    linkMatches.push(linkMatch);
                    continue;
                }
            }
            // --> Normal Internal Link
            const fileName = getWikiFileName(wikiMatch);
            if (fileName) {
                // Web links are to be skipped
                if (fileName.startsWith('http')) continue;
                const file = app.metadataCache.getFirstLinkpathDest(fileName, mdFile.path);
                const linkMatch: LinkMatch = {
                    type: 'wiki',
                    match: wikiMatch,
                    linkText: file ? file.path : fileName,
                    sourceFilePath: mdFile.path,
                };
                linkMatches.push(linkMatch);
            }
        }
    }

    // --> Get All Markdown Links
    const markdownMatches = extractMarkdownLinkMatches(fileText.toString());
    if (markdownMatches) {
        for (const markdownMatch of markdownMatches) {
            const destination = parseMarkdownLinkDestination(markdownMatch);
            if (!destination) {
                continue;
            }

            // --> Check if it is Transclusion
            if (destination.includes('#')) {
                const fileName = destination.split('#', 1)[0];
                const file = app.metadataCache.getFirstLinkpathDest(fileName, mdFile.path);
                if (fileName !== '') {
                    const linkMatch: LinkMatch = {
                        type: 'mdTransclusion',
                        match: markdownMatch,
                        linkText: file ? file.path : fileName,
                        sourceFilePath: mdFile.path,
                    };
                    linkMatches.push(linkMatch);
                    continue;
                }
            }
            // --> Normal Internal Link
            // Web links are to be skipped
            if (destination.startsWith('http')) continue;
            const file = app.metadataCache.getFirstLinkpathDest(destination, mdFile.path);
            const linkMatch: LinkMatch = {
                type: 'markdown',
                match: markdownMatch,
                linkText: file ? file.path : destination,
                sourceFilePath: mdFile.path,
            };
            linkMatches.push(linkMatch);
        }
    }
    return linkMatches;
};

/* ---------- HELPERS ---------- */

const wikiTransclusionRegex = /\[\[(.*?)#.*?\]\]/;
const matchIsWikiTransclusion = (match: string): boolean => {
    return wikiTransclusionRegex.test(match);
};

const getWikiFileName = (match: string): string => {
    const content = match.slice(2, -2);
    const separatorIndex = content.search(/[#|]/);

    return separatorIndex === -1 ? content : content.slice(0, separatorIndex);
};

/**
 * @param match
 * @returns file name if there is a match or empty string if no match
 */
const getTransclusionFileName = (match: string): string => {
    if (matchIsWikiTransclusion(match)) {
        return getWikiFileName(match);
    }

    return '';
};
