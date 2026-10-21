import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// A share sheet completing is not proof that a user saved a file. The caller
// asks for confirmation before clearing its backup reminder.
export async function exportBackupFile(content:string):Promise<void> {
  const name=`sweettalk-backup-${new Date().toISOString().slice(0,10)}.json`;
  if(Capacitor.isNativePlatform()) {
    const result=await Filesystem.writeFile({path:name,data:content,directory:Directory.Cache,encoding:Encoding.UTF8});
    try { await Share.share({url:result.uri,title:'SweetTalk backup',dialogTitle:'SweetTalk backup'}); }
    finally { await Filesystem.deleteFile({path:name,directory:Directory.Cache}).catch(()=>{}); }
    return;
  }
  const file=new File([content],name,{type:'application/json'});
  if(navigator.canShare?.({files:[file]})) { await navigator.share({files:[file],title:'SweetTalk backup'});return; }
  const url=URL.createObjectURL(file);
  const a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
