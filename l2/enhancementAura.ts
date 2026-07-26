/// <mls fileReference="_102033_/l2/enhancementAura.ts" enhancement="_blank" />

import { convertFileToTag, validateTagName } from '/_102033_/l2/utils.js'
import { getPropierties } from '/_102029_/l2/propiertiesLit.js'
import { setCodeLens } from '/_102029_/l2/codeLensLit.js';
import { injectStyle, injectStyleAction } from '/_102029_/l2/processCssLit.js'

export const requires: mls.l2.enhancement.IRequire[] = [
    {
        type: "cdn",
        name: "lit",
        ref: "https://cdn.jsdelivr.net/npm/lit@3/+esm",
    },
    {
        type: "cdn",
        name: "lit/decorators.js",
        ref: "https://cdn.jsdelivr.net/npm/lit@3/decorators.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/unsafe-html.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/unsafe-html.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/class-map.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/class-map.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/style-map.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/style-map.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/repeat.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/repeat.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/if-defined.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/if-defined.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/when.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/when.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/choose.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/choose.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/map.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/map.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/range.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/range.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/join.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/join.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/cache.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/cache.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/keyed.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/keyed.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/ref.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/ref.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/live.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/live.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/until.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/until.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/async-append.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/async-append.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/async-replace.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/async-replace.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/guard.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/guard.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/template-content.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/template-content.js/+esm",
    },
    {
        type: "cdn",
        name: 'lit/directives/unsafe-svg.js',
        ref: "https://cdn.jsdelivr.net/npm/lit@3/directives/unsafe-svg.js/+esm",
    },

    {
        type: "import",
        name: "tailwind.js",
        ref: "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4",
    }
];

export const getDefaultHtmlExamplePreview = (modelTS: mls.editor.IModelTS): string => {
    const { project, shortName, folder } = modelTS.storFile;
    const tag = convertFileToTag({ project, shortName, folder });
    return tag;
}

export const getDesignDetails = (modelTS: mls.editor.IModelTS): Promise<mls.l2.enhancement.IDesignDetailsReturn> => {
    return new Promise<mls.l2.enhancement.IDesignDetailsReturn>((resolve, reject) => {
        try {
            const ret: mls.l2.enhancement.IDesignDetailsReturn = {
                defaultGroupName: "",
                defaultHtmlExamplePreview: getDefaultHtmlExamplePreview(modelTS),
                properties: getPropierties(modelTS),
                webComponentDependencies: []
            }
            resolve(ret);
        } catch (e) {
            reject(e);
        }
    })
}

export const onAfterChange = async (modelTS: mls.editor.IModelTS): Promise<void> => {

    try {
        setCodeLens(modelTS);
        if (validateTagName(modelTS)) {
            mls.events.fireFileAction('statusOrErrorChanged', modelTS.storFile, 'left');
            mls.events.fireFileAction('statusOrErrorChanged', modelTS.storFile, 'right');
            return;
        }
    } catch (e: any) {
        return e.message || e;
    }
};


export const onAfterCompile = async (modelTS: mls.editor.IModelTS): Promise<void> => {
    await injectStyle(modelTS, 'Default', '_102033_/l2/enhancementAura');
    return;
}

export const onAfterCompileAction = async (sourceJS: string, sourceTS: string, css?: { sourceLess: string, sourceTokens: string }): Promise<string> => {
    return await injectStyleAction(sourceJS, sourceTS, css?.sourceLess || '', css?.sourceTokens || '', 'Default', '_102033_/l2/enhancementAura');
}
