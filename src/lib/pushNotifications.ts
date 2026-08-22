import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = 'BJWqyxYQwkLjpMGvpuDJ9aYFWkvZ7Hg3DHqfTJXATE6SeYTr7sj0SNxRC9aj29PPmYPiRB3fzyuudNPzZlHpimA';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export async function isPushSupported(): Promise<boolean> {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPushPermissionState(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

export async function registerPushSubscription(barberId: string, organizationId: string): Promise<boolean> {
  try {
    if (!(await isPushSupported())) {
      throw new Error('Push notifications não são suportadas neste navegador');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permissão de notificação negada');
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const subscriptionJson = subscription.toJSON();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        barber_id: barberId,
        organization_id: organizationId,
        endpoint: subscriptionJson.endpoint!,
        p256dh: subscriptionJson.keys!.p256dh!,
        auth: subscriptionJson.keys!.auth!,
        is_active: true,
      }, {
        onConflict: 'user_id,endpoint',
      });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Erro ao registrar push subscription:', err);
    throw err;
  }
}

export async function unregisterPushSubscription(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('user_id', user.id)
            .eq('endpoint', endpoint);
        }
      }
    }
  } catch (err) {
    console.error('Erro ao desregistrar push:', err);
  }
}

export async function checkPushSubscriptionExists(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
