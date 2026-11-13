import { getContext } from '../../../../extensions.js';
import { SlashCommandParser } from '../../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from '../../../../slash-commands/SlashCommandArgument.js';

import { buildInstructionPrompt } from './prompt.js';
import { ensureArray } from './utils.js';
import { getActivePreset } from './state.js';

const REGISTER_GUARD = '__instruction_sets_commands_registered__';

function safeJson(value) {
    return JSON.stringify(value, null, 2);
}

function getMergedPresetObject(scopeData, metadata, preset) {
    const presetState = metadata?.presetStates?.[preset.id]?.sections || {};

    return {
        id: preset.id,
        label: preset.name,
        enabled: metadata?.enabled !== false,
        position: metadata?.position ?? 0,
        depth: metadata?.depth ?? 4,
        role: metadata?.role ?? 0,
        sections: ensureArray(preset.sections).map(section => {
            const sectionState = presetState[section.id] || {};
            const activeSubsection = ensureArray(section.subsections).find(subsection => subsection.id === sectionState.selectedSubsectionId)
                || section.subsections?.[0]
                || null;

            return {
                id: section.id,
                label: section.name,
                active: activeSubsection?.name || '',
                order: Number(section.order ?? 100),
                enabled: sectionState.enabled !== false,
                subsections: ensureArray(section.subsections).map(subsection => ({
                    id: subsection.id,
                    label: subsection.name,
                    content: subsection.content,
                })),
            };
        }),
    };
}

function resolvePreset(scopeData, namedArgs = {}) {
    const presets = ensureArray(scopeData?.presets);
    const rawPreset = namedArgs.presetid ?? namedArgs.presetlabel ?? namedArgs.preset;
    if (rawPreset === undefined || rawPreset === null || String(rawPreset).trim() === '') {
        return null;
    }

    const needle = String(rawPreset).trim().toLowerCase();
    return presets.find(preset => String(preset.id) === String(rawPreset) || preset.name.trim().toLowerCase() === needle) || null;
}

function resolveSection(preset, namedArgs = {}) {
    const rawSection = namedArgs.sectionid ?? namedArgs.sectionlabel ?? namedArgs.section;
    if (!preset || rawSection === undefined || rawSection === null || String(rawSection).trim() === '') {
        return null;
    }

    const needle = String(rawSection).trim().toLowerCase();
    return ensureArray(preset.sections).find(section => String(section.id) === String(rawSection) || section.name.trim().toLowerCase() === needle) || null;
}

function getFieldValue(target, field) {
    if (!field) {
        return safeJson(target);
    }

    const key = String(field);
    const value = target?.[key];

    if (value === undefined || value === null) {
        return '';
    }

    if (typeof value === 'object') {
        return safeJson(value);
    }

    return String(value);
}

function createCommonPresetArguments({ includeShortAliases = false, includeSection = false } = {}) {
    const argumentsList = [
        SlashCommandNamedArgument.fromProps({
            name: 'presetlabel',
            description: 'Preset label to use when selecting a preset.',
            typeList: [ARGUMENT_TYPE.STRING],
        }),
        SlashCommandNamedArgument.fromProps({
            name: 'presetid',
            description: 'Preset ID to use when selecting a preset.',
            typeList: [ARGUMENT_TYPE.STRING, ARGUMENT_TYPE.NUMBER],
        }),
    ];

    if (includeShortAliases) {
        argumentsList.unshift(
            SlashCommandNamedArgument.fromProps({
                name: 'preset',
                description: 'Shortcut for preset label or preset ID.',
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        );
    }

    if (includeSection) {
        argumentsList.push(
            SlashCommandNamedArgument.fromProps({
                name: 'sectionlabel',
                description: 'Section label to use when selecting a section inside the chosen preset.',
                typeList: [ARGUMENT_TYPE.STRING],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'sectionid',
                description: 'Section ID to use when selecting a section inside the chosen preset.',
                typeList: [ARGUMENT_TYPE.STRING, ARGUMENT_TYPE.NUMBER],
            }),
        );

        if (includeShortAliases) {
            argumentsList.push(
                SlashCommandNamedArgument.fromProps({
                    name: 'section',
                    description: 'Shortcut for section label or section ID.',
                    typeList: [ARGUMENT_TYPE.STRING],
                }),
            );
        }
    }

    return argumentsList;
}

function registerCommandObjects({ getScopeData, getMetadata }) {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'instruction-set-list',
        callback: (namedArgs) => {
            const scopeData = getScopeData();
            const preset = resolvePreset(scopeData, namedArgs);

            if (!preset) {
                return safeJson(ensureArray(scopeData?.presets).map(item => item.name));
            }

            const section = resolveSection(preset, namedArgs);
            if (!section) {
                return safeJson(ensureArray(preset.sections).map(item => item.name));
            }

            return safeJson(ensureArray(section.subsections).map(item => item.name));
        },
        returns: 'a JSON array with preset labels, section labels, or subsection labels',
        namedArgumentList: createCommonPresetArguments({ includeShortAliases: true, includeSection: true }),
        helpString: `
            <div><code>/instruction-set-list [preset=string]? [presetlabel=string]? [presetid=string|number]? [section=string]? [sectionlabel=string]? [sectionid=string|number]?</code> =&gt; a JSON array with preset labels, section labels, or subsection labels</div>
            <br>
            <div>
                <strong>Arguments</strong>
                <ul>
                    <li><code>[preset=string]?</code> Optional shortcut that accepts a preset label or preset ID.</li>
                    <li><code>[presetlabel=string]?</code> Optional preset label. When provided, the command lists sections inside that preset.</li>
                    <li><code>[presetid=string|number]?</code> Optional preset ID. Alternative to <code>presetlabel</code>.</li>
                    <li><code>[section=string]?</code> Optional shortcut that accepts a section label or section ID.</li>
                    <li><code>[sectionlabel=string]?</code> Optional section label. When provided together with a preset selector, the command lists subsections inside that section.</li>
                    <li><code>[sectionid=string|number]?</code> Optional section ID. Alternative to <code>sectionlabel</code>.</li>
                </ul>
            </div>
            <div>
                Returns preset labels when no preset is selected. Returns section labels when a preset is selected. Returns subsection labels when both preset and section are selected.
            </div>
        `,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'instruction-set-get',
        callback: (namedArgs) => {
            const scopeData = getScopeData();
            const metadata = getMetadata();
            const preset = resolvePreset(scopeData, namedArgs);

            if (!preset) {
                return '';
            }

            const presetObject = getMergedPresetObject(scopeData, metadata, preset);
            const section = resolveSection(preset, namedArgs);

            if (!section) {
                return getFieldValue(presetObject, namedArgs.field);
            }

            const sectionObject = presetObject.sections.find(item => item.id === section.id) || null;
            if (!sectionObject) {
                return '';
            }

            return getFieldValue(sectionObject, namedArgs.field);
        },
        returns: 'a preset snapshot, a section snapshot, or the value of a specific field',
        namedArgumentList: [
            ...createCommonPresetArguments({ includeShortAliases: false, includeSection: true }),
            SlashCommandNamedArgument.fromProps({
                name: 'field',
                description: 'Optional field name to return instead of the full JSON object.',
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        ],
        helpString: `
            <div><code>/instruction-set-get [presetlabel=string]? [presetid=string|number]? [sectionlabel=string]? [sectionid=string|number]? [field=string]?</code> =&gt; a preset snapshot, a section snapshot, or the value of a specific field</div>
            <br>
            <div>
                <strong>Arguments</strong>
                <ul>
                    <li><code>[presetlabel=string]?</code> Optional preset label. Required when <code>presetid</code> is not supplied.</li>
                    <li><code>[presetid=string|number]?</code> Optional preset ID. Required when <code>presetlabel</code> is not supplied.</li>
                    <li><code>[sectionlabel=string]?</code> Optional section label inside the selected preset.</li>
                    <li><code>[sectionid=string|number]?</code> Optional section ID inside the selected preset.</li>
                    <li><code>[field=string]?</code> Optional field name. When omitted, the full preset or section object is returned as JSON.</li>
                </ul>
            </div>
            <div>
                Returns the full preset object when only a preset is selected. Returns the full section object when both preset and section are selected. Returns only the chosen field when <code>field</code> is provided.
            </div>
        `,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'instruction-set-prompt',
        callback: () => buildInstructionPrompt(getScopeData(), getMetadata()),
        returns: 'the exact Instruction Sets prompt for the active chat',
        helpString: `
            <div><code>/instruction-set-prompt</code> =&gt; the exact Instruction Sets prompt for the active chat</div>
            <br>
            <div>
                Returns exactly the same assembled instruction text that the extension injects into the prompt on the currently active chat.
            </div>
        `,
    }));
}

export function registerInstructionSetFeatures({ getScopeData, getMetadata }) {
    if (globalThis[REGISTER_GUARD]) {
        return;
    }

    globalThis[REGISTER_GUARD] = true;

    const context = getContext();
    context.unregisterMacro?.('instructionSet');
    context.registerMacro?.('instructionSet', () => buildInstructionPrompt(getScopeData(), getMetadata()));

    registerCommandObjects({ getScopeData, getMetadata });
}

export function getCurrentInstructionPrompt({ getScopeData, getMetadata }) {
    return buildInstructionPrompt(getScopeData(), getMetadata());
}

export function getCurrentPresetSnapshot({ getScopeData, getMetadata }) {
    const scopeData = getScopeData();
    const metadata = getMetadata();
    const activePreset = getActivePreset(scopeData, metadata);
    if (!activePreset) {
        return null;
    }

    return getMergedPresetObject(scopeData, metadata, activePreset);
}
