import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';

import {
    DEFAULT_METADATA,
    EXTENSION_FOLDER_PATH,
    EXTENSION_NAME,
    PROMPT_POSITIONS,
} from './src/constants.js';
import { registerInstructionSetFeatures } from './src/commands.js';
import { applyInstructionPrompt } from './src/prompt.js';
import {
    cloneSectionToPreset,
    cloneSubsectionToPreset,
    createPreset,
    createSection,
    createSubsection,
    duplicateSection,
    duplicateSubsection,
    ensureSectionMetadata,
    getActivePreset as getActivePresetFromState,
    getChatMetadata,
    getGlobalData,
    normalizeSection,
    saveChatMetadata,
    saveGlobalData,
    syncMetadataWithScope,
} from './src/state.js';
import {
    bindLargeEditor,
    bindSortable,
    closePanel,
    confirmPresetDeletion,
    confirmSectionDeletion,
    confirmSubsectionDeletion,
    createPanelSkeleton,
    openPanel,
    promptPresetName,
    renderPanelState,
    selectTargetPreset,
    togglePanel,
} from './src/ui.js';
import { normalizeNumber } from './src/utils.js';

const state = {
    root: null,
    editor: null,
    scopeData: { presets: [], uiState: { activePresetId: null } },
    metadata: JSON.parse(JSON.stringify(DEFAULT_METADATA)),
    popupOpenCount: 0,
};

function ensureExtensionSettings() {
    extension_settings[EXTENSION_NAME] = extension_settings[EXTENSION_NAME] || {};
}

function hasActiveChat(context) {
    return !!context && (context.groupId || context.characterId !== undefined);
}

function refreshStateFromContext() {
    state.scopeData = getGlobalData();
    state.metadata = syncMetadataWithScope(state.scopeData, getChatMetadata());
}

function getActivePreset() {
    return getActivePresetFromState(state.scopeData, state.metadata);
}

function getPresetById(presetId) {
    return state.scopeData.presets.find(preset => preset.id === presetId) || null;
}

function refreshPrompt() {
    const context = getContext();

    if (!hasActiveChat(context)) {
        context?.setExtensionPrompt?.('instruction_sets', '', PROMPT_POSITIONS.AFTER_MAIN_PROMPT, DEFAULT_METADATA.depth, false, DEFAULT_METADATA.role);
        return;
    }

    applyInstructionPrompt(context, state.scopeData, state.metadata);
}

function saveScope() {
    saveGlobalData(state.scopeData, saveSettingsDebounced);
}

function saveMetadata() {
    saveChatMetadata();
}

function setActivePresetId(presetId, { rerenderPanel = true, refreshInstructionPrompt = true } = {}) {
    state.metadata.activePresetId = presetId;
    state.scopeData.uiState.activePresetId = presetId;
    saveScope();
    saveMetadata();

    if (rerenderPanel) {
        rerender();
    }

    if (refreshInstructionPrompt) {
        refreshPrompt();
    }
}

function rerender() {
    if (!state.root) {
        return;
    }

    renderPanelState(state.root, state.scopeData, state.metadata);

    const activePreset = getActivePreset();
    bindSortable(state.root, {
        onReorderSections: orderedIds => {
            if (!activePreset) {
                return;
            }

            const reordered = orderedIds
                .map(id => activePreset.sections.find(section => section.id === id))
                .filter(Boolean);

            if (reordered.length === activePreset.sections.length) {
                activePreset.sections = reordered;
                saveScope();
                rerender();
                refreshPrompt();
            }
        },
        onReorderSubsections: (sectionId, orderedIds) => {
            if (!activePreset) {
                return;
            }

            const section = activePreset.sections.find(item => item.id === sectionId);
            if (!section) {
                return;
            }

            const reordered = orderedIds
                .map(id => section.subsections.find(subsection => subsection.id === id))
                .filter(Boolean);

            if (reordered.length === section.subsections.length) {
                section.subsections = reordered;
                saveScope();
                rerender();
                refreshPrompt();
            }
        },
    });
}

function syncAndRender() {
    refreshStateFromContext();
    rerender();
    refreshPrompt();
}

function findDrawerAnchor() {
    const preferredAnchors = [
        '#WI-SP-button',
        '#sys-settings-button',
        '#extensions-settings-button',
        '#wi-checkbox',
        '#WorldInfo',
        '#option_toggle_WI',
        '#option_toggle_AN',
    ];

    for (const selector of preferredAnchors) {
        const element = document.querySelector(selector);
        if (element instanceof HTMLElement) {
            const drawerElement = element.closest('.drawer');
            return { type: 'after', element: drawerElement instanceof HTMLElement ? drawerElement : element };
        }
    }

    const topSettingsHolder = document.querySelector('#top-settings-holder');
    if (topSettingsHolder instanceof HTMLElement) {
        return { type: 'append', element: topSettingsHolder };
    }

    return null;
}

function mountDrawer() {
    if (!state.root) {
        return false;
    }

    const anchor = findDrawerAnchor();
    if (!anchor) {
        return false;
    }

    if (anchor.type === 'after' && anchor.element.parentElement) {
        anchor.element.insertAdjacentElement('afterend', state.root);
        return true;
    }

    if (anchor.type === 'append') {
        anchor.element.append(state.root);
        return true;
    }

    return false;
}

function ensureDrawerMounted() {
    if (mountDrawer()) {
        return;
    }

    const observer = new MutationObserver(() => {
        if (mountDrawer()) {
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.setTimeout(() => {
        observer.disconnect();
        if (!state.root?.isConnected) {
            const topSettingsHolder = document.querySelector('#top-settings-holder');
            if (topSettingsHolder instanceof HTMLElement) {
                topSettingsHolder.append(state.root);
            }
        }
    }, 10000);
}

function getSection(sectionId) {
    return getActivePreset()?.sections.find(section => section.id === sectionId) || null;
}

function getSubsection(section, subsectionId) {
    return section?.subsections.find(subsection => subsection.id === subsectionId) || null;
}

function updateSubsectionOptionLabel(sectionId, subsectionId, label) {
    const sectionElement = state.root?.querySelector(`[data-section-id="${CSS.escape(sectionId)}"]`);
    const option = sectionElement?.querySelector(`.instructionsets-subsection-select option[value="${CSS.escape(subsectionId)}"]`);
    if (option) {
        option.textContent = label || 'Untitled subsection';
    }
}

function withPopup(handler) {
    return async (...args) => {
        state.popupOpenCount += 1;

        try {
            return await handler(...args);
        } finally {
            window.setTimeout(() => {
                state.popupOpenCount = Math.max(0, state.popupOpenCount - 1);
            }, 0);
        }
    };
}

function copySectionToPreset(sourceSection, targetPresetId) {
    const targetPreset = getPresetById(targetPresetId);
    if (!targetPreset) {
        return false;
    }

    targetPreset.sections.push(cloneSectionToPreset(sourceSection));
    return true;
}

function copySubsectionToPreset(sourceSection, sourceSubsection, targetPresetId) {
    const targetPreset = getPresetById(targetPresetId);
    if (!targetPreset) {
        return false;
    }

    const sourceName = String(sourceSection.name || '').trim().toLowerCase();
    let targetSection = targetPreset.sections.find(section => String(section.name || '').trim().toLowerCase() === sourceName) || null;

    if (!targetSection) {
        targetSection = normalizeSection({
            name: sourceSection.name,
            order: sourceSection.order,
            isExpanded: false,
            subsections: [],
        });
        targetSection.subsections = [];
        targetPreset.sections.push(targetSection);
    }

    targetSection.subsections.push(cloneSubsectionToPreset(sourceSubsection));
    return true;
}

async function handleSectionAction(action, sectionId, eventTarget) {
    const activePreset = getActivePreset();
    const section = getSection(sectionId);
    if (!activePreset || !section) {
        return;
    }

    switch (action) {
        case 'rename-section': {
            section.name = String(eventTarget.value || '');
            saveScope();
            return;
        }
        case 'select-subsection': {
            const sectionMetadata = ensureSectionMetadata(state.metadata, activePreset.id, section.id, state.scopeData);
            sectionMetadata.selectedSubsectionId = String(eventTarget.value || '');
            saveMetadata();
            refreshPrompt();
            return;
        }
        case 'set-section-order': {
            section.order = normalizeNumber(eventTarget.value, 100);
            saveScope();
            refreshPrompt();
            return;
        }
        case 'toggle-section-enabled': {
            const sectionMetadata = ensureSectionMetadata(state.metadata, activePreset.id, section.id, state.scopeData);
            const sectionElement = eventTarget.closest('[data-section-id]');
            const nextEnabled = sectionMetadata.enabled === false;
            sectionMetadata.enabled = nextEnabled;
            saveMetadata();

            if (sectionElement) {
                sectionElement.classList.toggle('instructionsets-section', nextEnabled);
                sectionElement.classList.toggle('instructionsets-section-off', !nextEnabled);

                if (!nextEnabled && sectionElement.matches(':hover')) {
                    sectionElement.classList.add('instructionsets-suppress-hover');
                } else {
                    sectionElement.classList.remove('instructionsets-suppress-hover');
                }

                const toggleIcon = sectionElement.querySelector('.instructionsets-section-enabled');
                toggleIcon?.classList.toggle('fa-toggle-on', nextEnabled);
                toggleIcon?.classList.toggle('fa-toggle-off', !nextEnabled);
            }

            refreshPrompt();
            return;
        }
        case 'copy-section-to-preset': {
            const targetPresetId = await withPopup(() => selectTargetPreset(state.scopeData.presets, activePreset.id, 'Copy section to preset'))();
            if (!targetPresetId) {
                return;
            }

            copySectionToPreset(section, targetPresetId);
            saveScope();
            rerender();
            return;
        }
        case 'duplicate-section': {
            const duplicate = duplicateSection(section);
            const index = activePreset.sections.findIndex(item => item.id === section.id);
            activePreset.sections.splice(index + 1, 0, duplicate);
            const originalMetadata = ensureSectionMetadata(state.metadata, activePreset.id, section.id, state.scopeData);
            ensureSectionMetadata(state.metadata, activePreset.id, duplicate.id, state.scopeData).enabled = originalMetadata.enabled;
            ensureSectionMetadata(state.metadata, activePreset.id, duplicate.id, state.scopeData).selectedSubsectionId = duplicate.subsections[0]?.id || null;
            saveScope();
            saveMetadata();
            rerender();
            refreshPrompt();
            return;
        }
        case 'delete-section': {
            const shouldDelete = await withPopup(() => confirmSectionDeletion(section.name))();
            if (!shouldDelete) {
                return;
            }

            activePreset.sections = activePreset.sections.filter(item => item.id !== section.id);
            const presetState = state.metadata.presetStates?.[activePreset.id]?.sections;
            if (presetState) {
                delete presetState[section.id];
            }
            saveScope();
            saveMetadata();
            rerender();
            refreshPrompt();
            return;
        }
        case 'add-subsection': {
            const subsection = createSubsection();
            section.subsections.push(subsection);
            const sectionMetadata = ensureSectionMetadata(state.metadata, activePreset.id, section.id, state.scopeData);
            if (!sectionMetadata.selectedSubsectionId) {
                sectionMetadata.selectedSubsectionId = subsection.id;
            }
            saveScope();
            saveMetadata();
            rerender();
            refreshPrompt();
            return;
        }
        default:
            return;
    }
}

async function handleSubsectionAction(action, sectionId, subsectionId, eventTarget) {
    const activePreset = getActivePreset();
    const section = getSection(sectionId);
    const subsection = getSubsection(section, subsectionId);

    if (!activePreset || !section || !subsection) {
        return;
    }

    switch (action) {
        case 'rename-subsection': {
            subsection.name = String(eventTarget.value || '');
            saveScope();
            updateSubsectionOptionLabel(sectionId, subsectionId, subsection.name);
            return;
        }
        case 'edit-subsection-content': {
            subsection.content = String(eventTarget.value || '');
            saveScope();
            refreshPrompt();
            return;
        }
        case 'copy-subsection-to-preset': {
            const targetPresetId = await withPopup(() => selectTargetPreset(state.scopeData.presets, activePreset.id, 'Copy subsection to preset'))();
            if (!targetPresetId) {
                return;
            }

            copySubsectionToPreset(section, subsection, targetPresetId);
            saveScope();
            rerender();
            return;
        }
        case 'duplicate-subsection': {
            const duplicate = duplicateSubsection(subsection);
            const index = section.subsections.findIndex(item => item.id === subsection.id);
            section.subsections.splice(index + 1, 0, duplicate);
            saveScope();
            rerender();
            refreshPrompt();
            return;
        }
        case 'delete-subsection': {
            const shouldDelete = await withPopup(() => confirmSubsectionDeletion(subsection.name))();
            if (!shouldDelete) {
                return;
            }

            section.subsections = section.subsections.filter(item => item.id !== subsection.id);
            if (section.subsections.length === 0) {
                section.subsections.push(createSubsection());
            }

            const sectionMetadata = ensureSectionMetadata(state.metadata, activePreset.id, section.id, state.scopeData);
            if (sectionMetadata.selectedSubsectionId === subsection.id) {
                sectionMetadata.selectedSubsectionId = section.subsections[0]?.id || null;
            }

            saveScope();
            saveMetadata();
            rerender();
            refreshPrompt();
            return;
        }
        case 'expand-editor': {
            state.editor.open(
                { sectionId, subsectionId },
                `${section.name || 'Section'} / ${subsection.name || 'Subsection'}`,
                subsection.content,
            );
            return;
        }
        default:
            return;
    }
}

async function addPreset() {
    const name = await withPopup(() => promptPresetName('New preset name', ''))();
    if (name === null) {
        return;
    }

    const preset = createPreset(name.trim());
    state.scopeData.presets.push(preset);
    saveScope();
    setActivePresetId(preset.id, { rerenderPanel: true, refreshInstructionPrompt: true });
}

async function renameActivePreset() {
    const activePreset = getActivePreset();
    if (!activePreset) {
        return;
    }

    const name = await withPopup(() => promptPresetName('Rename preset', activePreset.name || ''))();
    if (name === null) {
        return;
    }

    activePreset.name = name.trim();
    saveScope();
    rerender();
}

async function deleteActivePreset() {
    const activePreset = getActivePreset();
    if (!activePreset) {
        return;
    }

    const shouldDelete = await withPopup(() => confirmPresetDeletion(activePreset.name))();
    if (!shouldDelete) {
        return;
    }

    state.scopeData.presets = state.scopeData.presets.filter(preset => preset.id !== activePreset.id);
    delete state.metadata.presetStates[activePreset.id];

    if (state.scopeData.presets.length === 0) {
        state.scopeData.presets.push(createPreset('Default'));
    }

    const nextPreset = state.scopeData.presets[0];
    saveScope();
    setActivePresetId(nextPreset.id, { rerenderPanel: true, refreshInstructionPrompt: true });
}

function bindEvents() {
    const root = state.root;

    root.querySelector('#instructionsets-toolbar-button')?.addEventListener('click', event => {
        event.stopPropagation();
        togglePanel(root);
    });

    root.querySelector('#instructionsets-toolbar-icon')?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        root.querySelector('#instructionsets-toolbar-button')?.click();
    });

    root.addEventListener('click', event => {
        event.stopPropagation();
    });

    document.addEventListener('click', event => {
        if (!root.isConnected) {
            return;
        }

        const panel = root.querySelector('#instructionsets-panel');
        if (!panel?.classList.contains('openDrawer')) {
            return;
        }

        if (state.popupOpenCount > 0) {
            return;
        }

        const clickTarget = event.target;
        if (clickTarget instanceof Node && root.contains(clickTarget)) {
            return;
        }

        closePanel(root);
    });

    root.querySelector('.instructionsets-global-enabled')?.addEventListener('click', () => {
        state.metadata.enabled = !state.metadata.enabled;
        saveMetadata();
        rerender();
        refreshPrompt();
    });

    root.querySelector('#instructionsets-preset-select')?.addEventListener('input', event => {
        const presetId = String(event.target.value || '');
        if (!presetId) {
            return;
        }

        setActivePresetId(presetId, { rerenderPanel: true, refreshInstructionPrompt: true });
    });

    root.querySelector('#instructionsets-add-preset')?.addEventListener('click', async () => {
        await addPreset();
    });

    root.querySelector('#instructionsets-rename-preset')?.addEventListener('click', async () => {
        await renameActivePreset();
    });

    root.querySelector('#instructionsets-delete-preset')?.addEventListener('click', async () => {
        await deleteActivePreset();
    });

    root.querySelector('#instructionsets-position')?.addEventListener('input', event => {
        state.metadata.position = normalizeNumber(event.target.value, PROMPT_POSITIONS.AFTER_MAIN_PROMPT, { min: 0, max: 2 });
        saveMetadata();
        rerender();
        refreshPrompt();
    });

    root.querySelector('#instructionsets-depth')?.addEventListener('input', event => {
        state.metadata.depth = normalizeNumber(event.target.value, 4, { min: 0 });
        event.target.value = String(state.metadata.depth);
        saveMetadata();
        refreshPrompt();
    });

    root.querySelector('#instructionsets-role')?.addEventListener('input', event => {
        state.metadata.role = normalizeNumber(event.target.value, 0, { min: 0, max: 2 });
        saveMetadata();
        refreshPrompt();
    });

    root.querySelector('#instructionsets-add-section')?.addEventListener('click', () => {
        const activePreset = getActivePreset();
        if (!activePreset) {
            return;
        }

        const section = createSection();
        activePreset.sections.push(section);
        ensureSectionMetadata(state.metadata, activePreset.id, section.id, state.scopeData).selectedSubsectionId = section.subsections[0]?.id || null;
        saveScope();
        saveMetadata();
        rerender();
        refreshPrompt();
    });

    root.querySelector('#instructionsets-section-list')?.addEventListener('input', async event => {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) {
            return;
        }

        const sectionElement = event.target.closest('[data-section-id]');
        const subsectionElement = event.target.closest('.instructionsets-subsection');
        const action = actionTarget.dataset.action;
        const sectionId = sectionElement?.dataset.sectionId;
        const subsectionId = subsectionElement?.dataset.subsectionId;

        if (!sectionId) {
            return;
        }

        if (subsectionId) {
            await handleSubsectionAction(action, sectionId, subsectionId, event.target);
        } else {
            await handleSectionAction(action, sectionId, event.target);
        }
    });

    root.querySelector('#instructionsets-section-list')?.addEventListener('change', async event => {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) {
            return;
        }

        const sectionElement = event.target.closest('[data-section-id]');
        const subsectionElement = event.target.closest('.instructionsets-subsection');
        const action = actionTarget.dataset.action;
        const sectionId = sectionElement?.dataset.sectionId;
        const subsectionId = subsectionElement?.dataset.subsectionId;

        if (!sectionId) {
            return;
        }

        if (subsectionId) {
            await handleSubsectionAction(action, sectionId, subsectionId, event.target);
        } else {
            await handleSectionAction(action, sectionId, event.target);
        }
    });

    root.querySelector('#instructionsets-section-list')?.addEventListener('mouseout', event => {
        const sectionElement = event.target.closest('[data-section-id].instructionsets-suppress-hover');
        if (!sectionElement) {
            return;
        }

        if (sectionElement.contains(event.relatedTarget)) {
            return;
        }

        sectionElement.classList.remove('instructionsets-suppress-hover');
    });

    root.querySelector('#instructionsets-section-list')?.addEventListener('click', async event => {
        const target = event.target.closest('[data-action], .instructionsets-toggle-section, .instructionsets-toggle-subsection');
        if (!target) {
            return;
        }

        event.stopPropagation();

        const sectionElement = event.target.closest('[data-section-id]');
        const subsectionElement = event.target.closest('.instructionsets-subsection');
        const sectionId = sectionElement?.dataset.sectionId;
        const subsectionId = subsectionElement?.dataset.subsectionId;

        if (target.classList.contains('instructionsets-toggle-section') && sectionId) {
            const section = getSection(sectionId);
            if (!section) {
                return;
            }

            section.isExpanded = !section.isExpanded;
            saveScope();

            const sectionBody = sectionElement?.querySelector('.instructionsets-section-body');
            sectionBody?.classList.toggle('instructionsets-hidden', !section.isExpanded);
            const icon = target.querySelector('i');
            icon?.classList.toggle('fa-chevron-down', section.isExpanded);
            icon?.classList.toggle('fa-chevron-right', !section.isExpanded);
            return;
        }

        if (target.classList.contains('instructionsets-toggle-subsection') && sectionId && subsectionId) {
            const subsection = getSubsection(getSection(sectionId), subsectionId);
            if (!subsection) {
                return;
            }

            subsection.isExpanded = !subsection.isExpanded;
            saveScope();

            const subsectionBody = subsectionElement?.querySelector('.instructionsets-subsection-body');
            subsectionBody?.classList.toggle('instructionsets-hidden', !subsection.isExpanded);
            const icon = target.querySelector('i');
            icon?.classList.toggle('fa-chevron-down', subsection.isExpanded);
            icon?.classList.toggle('fa-chevron-right', !subsection.isExpanded);
            return;
        }

        const actionTarget = target.closest('[data-action]');
        if (!actionTarget) {
            return;
        }

        const action = actionTarget.dataset.action;
        if (!sectionId) {
            return;
        }

        if (subsectionId) {
            await handleSubsectionAction(action, sectionId, subsectionId, actionTarget);
        } else {
            await handleSectionAction(action, sectionId, actionTarget);
        }
    });

    state.editor = bindLargeEditor(root, {
        onOpen() {
            state.popupOpenCount += 1;
        },
        onClose() {
            window.setTimeout(() => {
                state.popupOpenCount = Math.max(0, state.popupOpenCount - 1);
            }, 0);
        },
        onSave(target, value) {
            const section = getSection(target.sectionId);
            const subsection = getSubsection(section, target.subsectionId);

            if (!section || !subsection) {
                return;
            }

            subsection.content = String(value || '');
            saveScope();
            rerender();
            refreshPrompt();
        },
    });
}

function registerLifecycleListeners() {
    const syncHandler = () => {
        refreshStateFromContext();
        if (state.root) {
            rerender();
        }
        refreshPrompt();
    };

    eventSource.on(event_types.CHAT_CHANGED, syncHandler);
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, refreshPrompt);
    eventSource.on(event_types.MESSAGE_DELETED, refreshPrompt);
    eventSource.on(event_types.MESSAGE_EDITED, refreshPrompt);
    eventSource.on(event_types.MESSAGE_SWIPED, refreshPrompt);
}

function initializeUi() {
    state.root = createPanelSkeleton();
    bindEvents();
    closePanel(state.root);
    ensureDrawerMounted();
    syncAndRender();
}

jQuery(async () => {
    ensureExtensionSettings();
    initializeUi();
    registerLifecycleListeners();
    registerInstructionSetFeatures({
        getScopeData: () => state.scopeData,
        getMetadata: () => state.metadata,
    });
    console.info(`${EXTENSION_NAME} loaded from ${EXTENSION_FOLDER_PATH}`);
});
