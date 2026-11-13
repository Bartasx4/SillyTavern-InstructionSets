import { MODULE_NAME } from './constants.js';
import { ensureArray, sortByOrderThenIndex } from './utils.js';
import { getActivePreset } from './state.js';

export function buildInstructionPrompt(scopeData, metadata) {
    if (!metadata?.enabled) {
        return '';
    }

    const activePreset = getActivePreset(scopeData, metadata);
    if (!activePreset) {
        return '';
    }

    const preparedSections = ensureArray(activePreset.sections).map((section, index) => ({ ...section, index }));
    const orderedSections = sortByOrderThenIndex(preparedSections);
    const blocks = [];

    for (const section of orderedSections) {
        const sectionMetadata = metadata.presetStates?.[activePreset.id]?.sections?.[section.id];
        if (sectionMetadata?.enabled === false) {
            continue;
        }

        const subsection = ensureArray(section.subsections).find(item => item.id === sectionMetadata?.selectedSubsectionId)
            || section.subsections?.[0];

        const content = String(subsection?.content || '').trim();
        if (!content) {
            continue;
        }

        blocks.push(content);
    }

    return blocks.join('\n\n');
}

export function applyInstructionPrompt(context, scopeData, metadata) {
    if (!context?.setExtensionPrompt) {
        return;
    }

    const prompt = buildInstructionPrompt(scopeData, metadata);

    if (!prompt) {
        context.setExtensionPrompt(MODULE_NAME, '', 0, metadata?.depth ?? 4, false, metadata?.role ?? 0);
        return;
    }

    context.setExtensionPrompt(
        MODULE_NAME,
        prompt,
        Number(metadata.position ?? 0),
        Number(metadata.depth ?? 4),
        false,
        Number(metadata.role ?? 0),
    );
}
