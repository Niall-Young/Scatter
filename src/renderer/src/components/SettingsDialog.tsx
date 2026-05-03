import { useEffect, useMemo, useState, type ReactElement } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import { DropdownMenu, DropdownMenuItem } from "./ui/dropdown-menu";
import { IconButton } from "./ui/icon-button";
import { KitButton } from "./ui/kit-button";
import { SelectTrigger } from "./ui/select";
import { Switch } from "./ui/switch";

export type ThemePreference = "system" | "light" | "dark";
export type LanguagePreference = "zh" | "en";

export interface SettingsValues {
  themePreference: ThemePreference;
  language: LanguagePreference;
  translucentBackground: boolean;
}

interface SettingsDialogProps extends SettingsValues {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreview: (values: SettingsValues) => void;
  onSave: (values: SettingsValues) => void;
}

interface SettingsOption<TValue extends string> {
  label: string;
  value: TValue;
}

const defaultSettings = {
  themePreference: "system",
  language: "zh",
  translucentBackground: true
} satisfies SettingsValues;

const themeOptions: Array<SettingsOption<ThemePreference>> = [
  { label: "系统", value: "system" },
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" }
];

const languageOptions: Array<SettingsOption<LanguagePreference>> = [
  { label: "中文", value: "zh" },
  { label: "English", value: "en" }
];

function SettingsSelect<TValue extends string>({
  ariaLabel,
  onChange,
  options,
  value
}: {
  ariaLabel: string;
  onChange: (value: TValue) => void;
  options: Array<SettingsOption<TValue>>;
  value: TValue;
}): ReactElement {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <RadixDropdownMenu.Root>
      <RadixDropdownMenu.Trigger asChild>
        <SelectTrigger className="settings-dialog-select" filled label={selected.label} size="sm" aria-label={ariaLabel} />
      </RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content className="settings-dialog-select-popover" sideOffset={6} align="end">
          <DropdownMenu className="settings-dialog-select-menu" role="menu">
            {options.map((option) => (
              <RadixDropdownMenu.Item key={option.value} asChild>
                <DropdownMenuItem
                  label={option.label}
                  selected={option.value === value}
                  role="menuitemradio"
                  aria-checked={option.value === value}
                  onClick={() => onChange(option.value)}
                />
              </RadixDropdownMenu.Item>
            ))}
          </DropdownMenu>
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}

export function SettingsDialog({
  language,
  onOpenChange,
  onPreview,
  onSave,
  open,
  themePreference,
  translucentBackground
}: SettingsDialogProps): ReactElement {
  const [draftThemePreference, setDraftThemePreference] = useState(themePreference);
  const [draftLanguage, setDraftLanguage] = useState(language);
  const [draftTranslucentBackground, setDraftTranslucentBackground] = useState(translucentBackground);

  useEffect(() => {
    setDraftThemePreference(themePreference);
    setDraftLanguage(language);
    setDraftTranslucentBackground(translucentBackground);
  }, [language, themePreference, translucentBackground]);

  const saveValues = useMemo(
    () => ({
      themePreference: draftThemePreference,
      language: draftLanguage,
      translucentBackground: draftTranslucentBackground
    }),
    [draftLanguage, draftThemePreference, draftTranslucentBackground]
  );

  useEffect(() => {
    if (!open) return;
    onPreview(saveValues);
  }, [onPreview, open, saveValues]);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="settings-dialog-overlay" />
        <RadixDialog.Content className="settings-dialog-content" aria-describedby={undefined}>
          <header className="settings-dialog-header">
            <RadixDialog.Title className="settings-dialog-title">设置</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton className="settings-dialog-close" filled={false} icon="x" size="sm" aria-label="关闭设置" />
            </RadixDialog.Close>
          </header>

          <div className="settings-dialog-body">
            <div className="settings-dialog-row">
              <span className="settings-dialog-row-label">主体</span>
              <SettingsSelect ariaLabel="主体" options={themeOptions} value={draftThemePreference} onChange={setDraftThemePreference} />
            </div>
            <div className="settings-dialog-row">
              <span className="settings-dialog-row-label">语言</span>
              <SettingsSelect ariaLabel="语言" options={languageOptions} value={draftLanguage} onChange={setDraftLanguage} />
            </div>
            <div className="settings-dialog-row">
              <span className="settings-dialog-row-label">半透明背景</span>
              <Switch checked={draftTranslucentBackground} onCheckedChange={setDraftTranslucentBackground} />
            </div>
          </div>

          <footer className="settings-dialog-footer">
            <div className="settings-dialog-actions">
              <KitButton
                filled={false}
                size="md"
                onClick={() => {
                  setDraftThemePreference(defaultSettings.themePreference);
                  setDraftLanguage(defaultSettings.language);
                  setDraftTranslucentBackground(defaultSettings.translucentBackground);
                }}
              >
                恢复默认
              </KitButton>
              <KitButton
                filled
                size="md"
                onClick={() => {
                  onSave(saveValues);
                  onOpenChange(false);
                }}
              >
                保存设置
              </KitButton>
            </div>
          </footer>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
