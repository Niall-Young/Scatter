import type { ReactElement } from "react";
import type { AppUpdateState } from "../../../shared/types";
import { useI18n } from "../lib/i18n";
import { Icon } from "./ui/icon";
import { IconButton } from "./ui/icon-button";
import { KitButton } from "./ui/kit-button";
import { ToastViewport } from "./ui/toast";

interface UpdateToastProps {
  onClose: () => void;
  onInstall: () => void;
  updateState: AppUpdateState;
}

export function UpdateToast({ onClose, onInstall, updateState }: UpdateToastProps): ReactElement {
  const { t } = useI18n();
  const version = updateState.downloadedVersion || updateState.availableVersion || "";

  return (
    <ToastViewport>
      <div className="update-toast" role="status" aria-live="polite">
        <Icon className="update-toast-icon" name="download" size={22} />
        <div className="update-toast-copy">
          <p className="update-toast-title">{t("updates.toast.title")}</p>
          <p className="update-toast-description">{t("updates.toast.description", { version })}</p>
        </div>
        <KitButton className="update-toast-install" filled size="sm" onClick={onInstall}>
          {t("updates.toast.install")}
        </KitButton>
        <IconButton className="update-toast-close" filled={false} icon="x" size="lg" aria-label={t("updates.toast.close")} onClick={onClose} />
      </div>
    </ToastViewport>
  );
}
