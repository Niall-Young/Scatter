import type { ReactElement } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import type { AppUpdateState } from "../../../shared/types";
import { useI18n } from "../lib/i18n";
import type { Translate } from "../lib/translations";
import { IconButton } from "./ui/icon-button";
import { KitButton } from "./ui/kit-button";

interface UpdateDialogProps {
  open: boolean;
  onCheckForUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  updateState: AppUpdateState;
}

function formatVersion(version?: string): string {
  if (!version) return "";
  return version.startsWith("v") ? version : `v${version}`;
}

function updateStatusText(updateState: AppUpdateState, t: Translate): { muted?: boolean; text: string } {
  if (!updateState.isPackaged && updateState.status !== "error") {
    return { muted: true, text: t("updates.dialog.developmentMode") };
  }

  if (updateState.status === "checking") {
    return { muted: true, text: t("updates.dialog.checking") };
  }

  if (updateState.status === "not-available") {
    return { muted: true, text: t("updates.dialog.notAvailable") };
  }

  if (updateState.status === "error") {
    return { muted: true, text: updateState.errorMessage || t("updates.dialog.error") };
  }

  return { muted: true, text: t("updates.dialog.checkPrompt") };
}

function updateProgressText(updateState: AppUpdateState, t: Translate): { hidden?: boolean; text: string } {
  if (updateState.status === "downloading") {
    const progress = Math.round(updateState.progressPercent ?? 0);
    return { text: t("updates.dialog.downloading", { progress }) };
  }

  if (updateState.canInstall) {
    return { text: t("updates.dialog.downloaded") };
  }

  return { hidden: true, text: t("updates.dialog.checkPrompt") };
}

function updateButtonLabel(updateState: AppUpdateState, t: Translate): string {
  if (updateState.canInstall) return t("updates.dialog.restartAction");
  if (updateState.status === "downloading" || updateState.availableVersion) return t("updates.dialog.updateAction");
  if (updateState.status === "checking") return t("settings.update.checking");
  return t("updates.dialog.checkAction");
}

export function UpdateDialog({
  onCheckForUpdates,
  onInstallUpdate,
  onOpenChange,
  open,
  updateState
}: UpdateDialogProps): ReactElement {
  const { t } = useI18n();
  const latestVersion = updateState.downloadedVersion || updateState.availableVersion;
  const status = updateStatusText(updateState, t);
  const progress = updateProgressText(updateState, t);
  const actionDisabled = !updateState.canInstall && (!updateState.isPackaged || updateState.status === "checking" || updateState.status === "downloading");
  const action = updateState.canInstall ? onInstallUpdate : onCheckForUpdates;

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="update-dialog-overlay" />
        <RadixDialog.Content className="update-dialog-content" aria-describedby={undefined}>
          <header className="update-dialog-header">
            <RadixDialog.Title className="update-dialog-title">{t("updates.dialog.title")}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton className="update-dialog-close" filled={false} icon="x" size="sm" aria-label={t("updates.dialog.close")} />
            </RadixDialog.Close>
          </header>

          <div className="update-dialog-body">
            <p className="update-dialog-line">{t("updates.dialog.currentVersion", { version: formatVersion(updateState.currentVersion) })}</p>
            {latestVersion ? (
              <p className="update-dialog-line">{t("updates.dialog.latestVersion", { version: formatVersion(latestVersion) })}</p>
            ) : (
              <p className={`update-dialog-line ${status.muted ? "is-muted" : ""}`}>{status.text}</p>
            )}
            <p className={`update-dialog-line ${progress.hidden ? "is-hidden" : ""}`}>{progress.text}</p>
          </div>

          <footer className="update-dialog-footer">
            <KitButton className="update-dialog-action" filled size="md" disabled={actionDisabled} onClick={() => void action()}>
              {updateButtonLabel(updateState, t)}
            </KitButton>
          </footer>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
