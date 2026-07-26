/// <mls fileReference="_102033_/l2/utils.ts" enhancement="_blank"/>

import { setErrorOnModel } from '/_102029_/l2/utils.js';

import type { IDecoratorDictionary, IDecoratorDetails, IDecoratorClassInfo } from '/_102029_/l2/propiertiesLit.js';

export interface IFileInfoBase {
    project: number;
    level: number;
    shortName: string;
    folder: string;
    extension: string;
}

export interface IResolvedFile {
    project: number;
    shortName: string;
    folder: string;
}

export function resolveTagToFile(
    tag: string
): IResolvedFile | undefined {

    if (isNewFormat(tag)) {
        return resolveNewTag(tag);
    }

    return convertTagToFileName(tag);
}

// === ENTRADA PRINCIPAL: FILE → TAG ===

export function convertFileToTag(info: {
    shortName: string;
    project: number;
    folder?: string;
}): string {

    const { shortName } = info;

    // Formato novo só se o shortName ORIGINAL já tem '-' (kebab nativo)
    // ex: "widget-test" → novo | "widgetTest" → legado
    if (shortName.includes('-')) {
        return fileToTagNew(info);
    }

    return fileToTagLegacy(info);
}

function isNewFormat(tag: string): boolean {
    return !/-\d+$/.test(tag);
}

function resolveNewTag(
    tag: string,
): IResolvedFile | undefined {

    if (!mls.actualProject) return undefined;

    const currentProject: number = mls.actualProject;
    const dependencies: number[] = mls.l5.getProjectDependencies(mls.actualProject, false);
    const files: Record<string, IFileInfoBase> = mls.stor.files;

    const parsed = parseNewTag(tag);
    if (!parsed) return undefined;

    const { shortName, folderSuffix } = parsed;
    const searchOrder = [currentProject, ...dependencies];

    for (const project of searchOrder) {
        const found = Object.values(files).find((f) => {
            if (f.project !== project) return false;
            if (toKebab(f.shortName) !== shortName) return false;
            if (!folderSuffix) return true;

            // Match pelo final do folder
            // ex: folderSuffix = "groupSelectOne"
            //     f.folder = "molecules/groupSelectOne" → OK
            //     f.folder = "groupSelectOne"            → OK
            return f.folder === folderSuffix || f.folder.endsWith('/' + folderSuffix);
        });

        if (found) {
            return { project, shortName, folder: found.folder };
        }
    }

    return undefined;
}

function parseNewTag(tag: string): { shortName: string; folderSuffix: string } | undefined {
    const separatorIndex = tag.indexOf('--');

    if (separatorIndex === -1) {
        return { shortName: tag, folderSuffix: '' };
    }

    const folderPart = tag.substring(0, separatorIndex);
    const namePart = tag.substring(separatorIndex + 2);

    if (!namePart) return undefined;

    return {
        shortName: namePart,
        folderSuffix: fromKebab(folderPart),
    };
}

function fileToTagNew(info: { shortName: string; folder?: string }): string {
    const { shortName, folder = '' } = info;
    const kebabName = toKebab(shortName);

    if (!folder) return kebabName;

    // Usa só a última parte do folder na tag
    const parts = folder.split('/');
    const lastFolder = parts[parts.length - 1];
    const kebabFolder = toKebab(lastFolder);

    return `${kebabFolder}--${kebabName}`;
}

// === FORMATO LEGADO (com projeto) ===

function convertTagToFileName(tag: string): IResolvedFile | undefined {
    const parts = tag.split('--');
    const namePart = parts.pop() || '';
    const folder = parts.join('/').replace(/-(.)/g, (_, letter) => letter.toUpperCase());

    const match = namePart.match(/(.+)-(\d+)$/);
    if (!match) return undefined;

    const [, rest, number] = match;
    const shortName = rest.replace(/-(.)/g, (_, letter) => letter.toUpperCase());

    return { shortName, project: +number, folder };
}

function fileToTagLegacy(info: { shortName: string; project: number; folder?: string }): string {
    const { shortName, project, folder = '' } = info;
    const kebabName = toKebab(shortName);
    const baseName = `${kebabName}-${project}`;
    const folderPrefix = folder
        ? toKebab(folder).replace(/\//g, '--') + '--'
        : '';
    return `${folderPrefix}${baseName}`;
}


function toKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function fromKebab(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}


export function isPageFile(folder: string): boolean {
    if (!mls.actualModule) return false;
    const match = folder.match(/^(.+?)\/(web\/desktop|web\/mobile|android|ios)\/page\d+$/);
    if (!match) return false;
    return match[1] === mls.actualModule;
}

export function validateTagName(modelTS: mls.editor.IModelTS): boolean {

    if (!modelTS || !modelTS.storFile) return false;

    const { storFile, model } = modelTS;
    const { project, shortName, folder } = storFile;

    storFile.hasError = false;
    clearErrorsOnModel(model)

    if (!modelTS.compilerResults) return false;
    const decorators: IDecoratorDictionary = JSON.parse(modelTS.compilerResults.decorators);
    if (!decorators) return false;
    const decoratorToCheck = 'customElement';
    let rc: boolean = false;

    Object.entries(decorators).forEach((entrie) => {
        const decoratorInfo: IDecoratorDetails = entrie[1];
        if (!decoratorInfo || decoratorInfo.type !== 'ClassDeclaration') return;
        decoratorInfo.decorators.forEach((_decorator) => {
            const decoratorInfo = getDecoratorClassInfo(_decorator.text);
            if (!decoratorInfo || decoratorInfo.decoratorName !== decoratorToCheck) return;

            let correctTagName = convertFileToTag({ project, shortName, folder });
            if (correctTagName !== decoratorInfo.tagName) {
                rc = true;
                setErrorOnModel(model, _decorator.line + 1, decoratorToCheck.length + 3, _decorator.text.length + 1, `Invalid web component tag name, the correct definition is: ${correctTagName}`, monaco.MarkerSeverity.Error);
                storFile.hasError = true;
            }
        })
    })

    return rc;
}

function clearErrorsOnModel(model: monaco.editor.ITextModel) {
    monaco.editor.setModelMarkers(model, 'markerSource', []);
}

function getDecoratorClassInfo(decoratorString: string): IDecoratorClassInfo | undefined {
    const regex = /(\w+)\(['"](.+?)['"]\)/;
    const match = decoratorString.match(regex);
    let result: IDecoratorClassInfo | undefined = undefined;
    if (match && match.length > 2) {
        const decoratorName = match[1];
        const tagName = match[2];
        result = {
            decoratorName,
            tagName,
        };
    }
    return result;
}
