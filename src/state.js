import { chat_metadata } from '../../../../../script.js';
import { extension_settings, getContext, saveMetadataDebounced } from '../../../../extensions.js';

import {
    DEFAULT_METADATA,
    DEFAULT_SCOPE_DATA,
    EXTENSION_NAME,
    LEGACY_METADATA_KEYS,
    METADATA_KEY,
} from './constants.js';
import { deepClone, ensureArray, generateId, normalizeNumber } from './utils.js';

function hasActiveChatContext() {
    const context = getContext();
    return !!context && (context.groupId || context.characterId !== undefined);
}

function getExtensionStore() {
    extension_settings[EXTENSION_NAME] = extension_settings[EXTENSION_NAME] || {};
    extension_settings[EXTENSION_NAME].library = extension_settings[EXTENSION_NAME].library || deepClone(DEFAULT_SCOPE_DATA);
    extension_settings[EXTENSION_NAME].scopes = extension_settings[EXTENSION_NAME].scopes || {};
    return extension_settings[EXTENSION_NAME];
}

function createDefaultSubsection() {
    return {
        id: generateId('u'),
        name: '',
        content: '',
        isExpanded: false,
    };
}

function createDefaultSection() {
    return {
        id: generateId('s'),
        name: '',
        order: 100,
        isExpanded: false,
        subsections: [createDefaultSubsection()],
    };
}

function createDefaultPresetInternal(name = 'Default') {
    return {
        id: generateId('p'),
        name,
        sections: [],
    };
}

export function createPreset(name = '') {
    return createDefaultPresetInternal(name || '');
}

export function normalizeSubsection(subsection) {
    return {
        id: subsection?.id || generateId('u'),
        name: String(subsection?.name ?? ''),
        content: String(subsection?.content ?? ''),
        isExpanded: subsection?.isExpanded === true,
    };
}

export function normalizeSection(section) {
    const normalizedSubsections = ensureArray(section?.subsections).map(normalizeSubsection);

    return {
        id: section?.id || generateId('s'),
        name: String(section?.name ?? ''),
        order: normalizeNumber(section?.order, 100),
        isExpanded: section?.isExpanded === true,
        subsections: normalizedSubsections.length > 0 ? normalizedSubsections : [createDefaultSubsection()],
    };
}

export function normalizePreset(preset) {
    return {
        id: preset?.id || generateId('p'),
        name: String(preset?.name ?? ''),
        sections: ensureArray(preset?.sections).map(normalizeSection),
    };
}

function migrateLegacyScopes(extensionStore) {
    const presets = ensureArray(extensionStore.library?.presets);
    if (presets.length > 0) {
        return;
    }

    const legacySections = ensureArray(extensionStore.library?.sections).map(normalizeSection);
    if (legacySections.length > 0) {
        extensionStore.library.presets = [{
            ...createDefaultPresetInternal('Default'),
            sections: legacySections,
        }];
        delete extensionStore.library.sections;
        return;
    }

    const legacyScopes = extensionStore.scopes && typeof extensionStore.scopes === 'object' ? Object.values(extensionStore.scopes) : [];
    const mergedSections = [];
    const seenIds = new Set();

    for (const scope of legacyScopes) {
        for (const section of ensureArray(scope?.sections).map(normalizeSection)) {
            if (seenIds.has(section.id)) {
                continue;
            }

            seenIds.add(section.id);
            mergedSections.push(section);
        }
    }

    extensionStore.library.presets = [{
        ...createDefaultPresetInternal('Default'),
        sections: mergedSections,
    }];
}

export function getGlobalData() {
    const extensionStore = getExtensionStore();
    migrateLegacyScopes(extensionStore);

    extensionStore.library.presets = ensureArray(extensionStore.library.presets).map(normalizePreset);
    extensionStore.library.uiState = extensionStore.library.uiState && typeof extensionStore.library.uiState === 'object'
        ? extensionStore.library.uiState
        : deepClone(DEFAULT_SCOPE_DATA.uiState);

    if (extensionStore.library.presets.length === 0) {
        extensionStore.library.presets.push(createDefaultPresetInternal('Default'));
    }

    if (!extensionStore.library.uiState.activePresetId || !extensionStore.library.presets.some(preset => preset.id === extensionStore.library.uiState.activePresetId)) {
        extensionStore.library.uiState.activePresetId = extensionStore.library.presets[0].id;
    }

    return extensionStore.library;
}

export function saveGlobalData(scopeData, saveSettings) {
    const extensionStore = getExtensionStore();
    const presets = ensureArray(scopeData?.presets).map(normalizePreset);

    extensionStore.library = {
        presets: presets.length > 0 ? presets : [createDefaultPresetInternal('Default')],
        uiState: {
            activePresetId: scopeData?.uiState?.activePresetId || presets[0]?.id || null,
        },
    };

    if (!extensionStore.library.uiState.activePresetId || !extensionStore.library.presets.some(preset => preset.id === extensionStore.library.uiState.activePresetId)) {
        extensionStore.library.uiState.activePresetId = extensionStore.library.presets[0]?.id || null;
    }

    saveSettings();
}

function ensureMetadataRoot() {
    if (!hasActiveChatContext()) {
        return deepClone(DEFAULT_METADATA);
    }

    if (!chat_metadata[METADATA_KEY]) {
        for (const legacyKey of LEGACY_METADATA_KEYS) {
            if (chat_metadata[legacyKey]) {
                chat_metadata[METADATA_KEY] = deepClone(chat_metadata[legacyKey]);
                delete chat_metadata[legacyKey];
                break;
            }
        }
    }

    chat_metadata[METADATA_KEY] = chat_metadata[METADATA_KEY] || deepClone(DEFAULT_METADATA);
    return chat_metadata[METADATA_KEY];
}

export function getChatMetadata() {
    const metadata = ensureMetadataRoot();
    metadata.enabled = metadata.enabled !== false;
    metadata.position = normalizeNumber(metadata.position, DEFAULT_METADATA.position, { min: 0, max: 2 });
    metadata.depth = normalizeNumber(metadata.depth, DEFAULT_METADATA.depth, { min: 0 });
    metadata.role = normalizeNumber(metadata.role, DEFAULT_METADATA.role, { min: 0, max: 2 });
    metadata.activePresetId = metadata.activePresetId ? String(metadata.activePresetId) : null;
    metadata.presetStates = metadata.presetStates && typeof metadata.presetStates === 'object' ? metadata.presetStates : {};
    return metadata;
}

export function saveChatMetadata() {
    if (!hasActiveChatContext()) {
        return;
    }

    saveMetadataDebounced();
}

export function ensurePresetMetadata(metadata, presetId) {
    if (!metadata.presetStates[presetId]) {
        metadata.presetStates[presetId] = {
            sections: {},
        };
    }

    return metadata.presetStates[presetId];
}

export function ensureSectionMetadata(metadata, presetId, sectionId, scopeData) {
    const preset = ensureArray(scopeData?.presets).find(item => item.id === presetId);
    const presetMetadata = ensurePresetMetadata(metadata, presetId);

    if (!presetMetadata.sections[sectionId]) {
        const section = ensureArray(preset?.sections).find(item => item.id === sectionId);
        presetMetadata.sections[sectionId] = {
            enabled: true,
            selectedSubsectionId: section?.subsections?.[0]?.id || null,
        };
    }

    return presetMetadata.sections[sectionId];
}

export function syncMetadataWithScope(scopeData, metadata = getChatMetadata()) {
    const presets = ensureArray(scopeData?.presets);
    const presetIds = new Set(presets.map(preset => preset.id));

    for (const preset of presets) {
        const presetMetadata = ensurePresetMetadata(metadata, preset.id);
        const sectionIds = new Set(ensureArray(preset.sections).map(section => section.id));

        for (const section of ensureArray(preset.sections)) {
            const sectionMetadata = ensureSectionMetadata(metadata, preset.id, section.id, scopeData);
            const subsectionIds = new Set(ensureArray(section.subsections).map(subsection => subsection.id));

            if (!subsectionIds.has(sectionMetadata.selectedSubsectionId)) {
                sectionMetadata.selectedSubsectionId = section.subsections?.[0]?.id || null;
            }
        }

        for (const sectionId of Object.keys(presetMetadata.sections)) {
            if (!sectionIds.has(sectionId)) {
                delete presetMetadata.sections[sectionId];
            }
        }
    }

    for (const presetId of Object.keys(metadata.presetStates)) {
        if (!presetIds.has(presetId)) {
            delete metadata.presetStates[presetId];
        }
    }

    const fallbackPresetId = scopeData?.uiState?.activePresetId || presets[0]?.id || null;
    if (!metadata.activePresetId || !presetIds.has(metadata.activePresetId)) {
        metadata.activePresetId = fallbackPresetId;
    }

    return metadata;
}

export function getActivePreset(scopeData, metadata) {
    const presets = ensureArray(scopeData?.presets);
    return presets.find(preset => preset.id === metadata?.activePresetId) || presets[0] || null;
}

export function createSection() {
    return createDefaultSection();
}

export function duplicateSection(section) {
    const cloned = deepClone(section);
    cloned.id = generateId('s');
    cloned.name = `${section.name || 'Section'} Copy`;
    cloned.subsections = ensureArray(cloned.subsections).map(subsection => ({
        ...normalizeSubsection(subsection),
        id: generateId('u'),
    }));
    return normalizeSection(cloned);
}

export function cloneSectionToPreset(section) {
    const cloned = deepClone(section);
    cloned.id = generateId('s');
    cloned.isExpanded = false;
    cloned.subsections = ensureArray(cloned.subsections).map(subsection => ({
        ...normalizeSubsection(subsection),
        id: generateId('u'),
        isExpanded: false,
    }));
    return normalizeSection(cloned);
}

export function createSubsection() {
    return createDefaultSubsection();
}

export function duplicateSubsection(subsection) {
    return normalizeSubsection({
        ...deepClone(subsection),
        id: generateId('u'),
        name: `${subsection.name || 'Subsection'} Copy`,
    });
}

export function cloneSubsectionToPreset(subsection) {
    return normalizeSubsection({
        ...deepClone(subsection),
        id: generateId('u'),
        isExpanded: false,
    });
}
