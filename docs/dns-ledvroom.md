# DNS de ledvroom.com

Les six enregistrements à publier chez Hostinger, une fois le domaine
enregistré. Ils se posent en une seule fois : deux pour que le site réponde,
quatre pour que les e-mails partent.

**Le domaine n'est pas encore enregistré** au moment où ceci est écrit
(24 octobre 2026). Hostinger l'affiche dans le portefeuille avec la mention
« n'est pas enregistré » et « Vous avez ajouté ce nom de domaine à votre site,
mais vous ne l'avez pas encore acheté ». Rien de ce qui suit ne peut être posé
avant.

## Le site — vers Render

| Type | Hôte | Valeur | Pourquoi |
| --- | --- | --- | --- |
| `A` | `@` | `216.24.57.1` | L'apex. **Pas un CNAME** : le DNS interdit un CNAME à la racine d'une zone, et Hostinger ne propose ni ALIAS ni ANAME pour le contourner. Render fournit cette adresse pour ce cas précis. |
| `CNAME` | `www` | `lumera-web.onrender.com` | Render redirige ensuite `www` vers l'apex. |

Les deux domaines sont déjà déclarés sur le service `lumera-web` (Settings ›
Custom Domains) et attendent le DNS. Le sous-domaine `onrender.com` reste
actif : le site continue de répondre sur `lumera-web.onrender.com` pendant la
bascule, et le retour en arrière est immédiat.

## Les e-mails — vers MailerSend

| Type | Hôte | Valeur | Pourquoi |
| --- | --- | --- | --- |
| `TXT` | `@` | `v=spf1 include:_spf.mailersend.net ~all` | SPF : autorise MailerSend à écrire au nom du domaine. |
| `CNAME` | `ms1._domainkey` | `ms1._domainkey.mailersend.net` | DKIM, première clé. |
| `CNAME` | `ms2._domainkey` | `ms2._domainkey.mailersend.net` | DKIM, seconde clé. |
| `CNAME` | `mta` | `mailersend.net` | Return-path : les rejets reviennent au bon endroit plutôt que de disparaître. |

Le domaine est déjà ajouté chez MailerSend (compte `carpartsfrance`) et attend
ces enregistrements. Vérification annoncée jusqu'à 48 h.

### DMARC — à ajouter, même si MailerSend ne le réclame pas

| Type | Hôte | Valeur |
| --- | --- | --- |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@ledvroom.com` |

Gmail et Yahoo l'exigent depuis 2024 pour les expéditeurs de volume. `p=none`
n'impose rien et se contente d'observer : c'est le réglage par lequel on
commence, le temps de vérifier dans les rapports que tous les envois
légitimes passent. On durcit ensuite vers `quarantine` puis `reject`.

## Ensuite

1. **Vérifier la propagation** avant de toucher à l'application :

   ```bash
   dig +short A ledvroom.com          # doit rendre 216.24.57.1
   dig +short CNAME www.ledvroom.com  # doit rendre lumera-web.onrender.com.
   dig +short TXT ledvroom.com        # doit contenir _spf.mailersend.net
   ```

2. **Dans Render › `lumera-web` › Settings › Custom Domains**, lancer
   *Verify* sur les deux entrées, et attendre le certificat TLS.

3. **Passer `NEXT_PUBLIC_SITE_URL` à `https://ledvroom.com`** — et pas avant
   que le domaine ne réponde. Cette variable construit les URL canoniques,
   les liens des e-mails et l'adresse de notification du prestataire de
   paiement : pointée sur un domaine qui ne résout pas, elle fabrique des
   liens morts sans qu'aucune erreur ne le signale.

   Elle est en `sync: false`, donc elle se renseigne dans le tableau de bord.

4. **Renseigner `EMAIL_FROM`** (par exemple `contact@ledvroom.com`) et
   `EMAIL_API_KEY` (jeton créé chez MailerSend). Tant que l'une des deux
   manque, l'application considère l'envoi comme simulé, l'écrit dans
   `EmailLog` et le dit dans les journaux — elle ne laisse pas croire qu'un
   message est parti.

5. **Laisser `NEXT_PUBLIC_DEMO_MODE` à `on`** tant que la boutique n'ouvre
   pas. Le `noindex` tient à cela : rattacher le domaine ne met pas le site
   dans les moteurs de recherche, et c'est voulu.
