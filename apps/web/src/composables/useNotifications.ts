import { reactive, ref } from "vue";

export function useNotifications() {
  const permission = ref<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    permission.value = await Notification.requestPermission();
  }

  // reactive() so `permission` auto-unwraps when accessed off the returned object in templates.
  return reactive({ permission, requestPermission });
}
