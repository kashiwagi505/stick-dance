// モックアップ用: 開いた状態で見せる。「クレジット」で開き直せる
const dlg = document.getElementById('credit-dialog');
document.getElementById('credit').addEventListener('click', () => dlg.showModal());
document.getElementById('close').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', () => document.getElementById('credit').focus());
dlg.showModal();
