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
export const getAllLinkMatchesInFile = async (mdFile: TFile, app: App, fileText?: String): Promise<LinkMatch[]> => {
    const linkMatches: LinkMatch[] = [];
    if (fileText === undefined) {
        fileText = await app.vault.read(mdFile);
    }

    // --> Get All WikiLinks
    let wikiRegex = /\[\[.*?\]\]/g;
    let wikiMatches = fileText.match(wikiRegex);
    if (wikiMatches) {
        let fileRegex = /(?<=\[\[).*?(?=(\]|\|))/;

        for (let wikiMatch of wikiMatches) {
            // --> Check if it is Transclusion
            if (matchIsWikiTransclusion(wikiMatch)) {
                let fileName = getTransclusionFileName(wikiMatch);
                let file = app.metadataCache.getFirstLinkpathDest(fileName, mdFile.path);
                if (fileName !== '') {
                    let linkMatch: LinkMatch = {
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
            let fileMatch = wikiMatch.match(fileRegex);
            if (fileMatch) {
                // Web links are to be skipped
                if (fileMatch[0].startsWith('http')) continue;
                let file = app.metadataCache.getFirstLinkpathDest(fileMatch[0], mdFile.path);
                let linkMatch: LinkMatch = {
                    type: 'wiki',
                    match: wikiMatch,
                    linkText: file ? file.path : fileMatch[0],
                    sourceFilePath: mdFile.path,
                };
                linkMatches.push(linkMatch);
            }
        }
    }

    // --> Get All Markdown Links
    let markdownMatches = extractMarkdownLinkMatches(fileText.toString());
    if (markdownMatches) {
        for (let markdownMatch of markdownMatches) {
            const destination = parseMarkdownLinkDestination(markdownMatch);
            if (!destination) {
                continue;
            }

            // --> Check if it is Transclusion
            if (destination.includes('#')) {
                let fileName = destination.split('#', 1)[0];
                let file = app.metadataCache.getFirstLinkpathDest(fileName, mdFile.path);
                if (fileName !== '') {
                    let linkMatch: LinkMatch = {
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
            let file = app.metadataCache.getFirstLinkpathDest(destination, mdFile.path);
            let linkMatch: LinkMatch = {
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
const wikiTransclusionFileNameRegex = /(?<=\[\[)(.*)(?=#)/;

const matchIsWikiTransclusion = (match: string): boolean => {
    return wikiTransclusionRegex.test(match);
};

/**
 * @param match
 * @returns file name if there is a match or empty string if no match
 */
const getTransclusionFileName = (match: string): string => {
    if (matchIsWikiTransclusion(match)) {
        let fileNameMatch = match.match(wikiTransclusionFileNameRegex);
        if (fileNameMatch) return fileNameMatch[0];
    }

    return '';
};
