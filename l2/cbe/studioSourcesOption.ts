/// <mls fileReference="_102033_/l2/cbe/studioSourcesOption.ts" enhancement="_blank" />
import type { DriverVm } from '/_102033_/l2/cbe/driverVm.js';

const KEY = 'collabStudioSourcesFromGitHub';

/// **collab_i18n_start**
const message_en = {
  gitSlotWriteRefused:
    "this project lives on GitHub; turn on 'Fetch sources from GitHub' in the draft panel to edit it",
};
type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    gitSlotWriteRefused:
      "este projeto vive no GitHub; ligue 'Buscar fontes no GitHub' no painel do rascunho para editá-lo",
  },
  es: {
    gitSlotWriteRefused:
      "este proyecto vive en GitHub; active 'Buscar fuentes en GitHub' en el panel del borrador para editarlo",
  },
};
/// **collab_i18n_end**

function gitSlotWriteRefusedText(): string {
  const requested = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en';
  const primary = requested.trim().toLowerCase().split('-')[0];
  return (messages[primary] ?? messages.en).gitSlotWriteRefused;
}

export function readSourcesFromGitHub(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch (err) {
    console.error('[studioSourcesOption] failed to read collabStudioSourcesFromGitHub:', err);
    return false;
  }
}

export function writeSourcesFromGitHub(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '');
  } catch (err) {
    console.error('[studioSourcesOption] failed to write collabStudioSourcesFromGitHub:', err);
  }
}

function refuseGitSlotWrite(project: number): never {
  const message = gitSlotWriteRefusedText();
  console.error(`[studioSourcesOption] refused write for git-declared project ${project}`);
  throw new Error(message);
}

/** DriverVm that still reads from the VM, but refuses writes through a git slot. */
export async function createGitSlotVmDriver(): Promise<DriverVm> {
  const { DriverVm: DriverVmClass } = await import('/_102033_/l2/cbe/driverVm.js');
  class GitSlotVmDriver extends DriverVmClass {
    public setContents = async (
      project: number,
      _fileInfos: mls.stor.IFileInfo[],
      _comments: string | null,
    ): Promise<boolean> => {
      refuseGitSlotWrite(project);
    };
  }
  return new GitSlotVmDriver();
}
