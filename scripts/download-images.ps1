$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function U($name) { return "https://commons.wikimedia.org/wiki/Special:FilePath/$name" }

$files = @{
    # --- Baobabs (12) ---
    "public\images\madagascar\baobab-1.jpg"  = U "Madagascar baobab.JPG"
    "public\images\madagascar\baobab-2.jpg"  = U "Walking the Avenue of the Baobabs.jpg"
    "public\images\madagascar\baobab-3.jpg"  = U "Twin Baobab tree in Avenue of Baobabs in Madagascar.jpg"
    "public\images\madagascar\baobab-4.jpg"  = U "Adansonia Grandidieri Baobab Morondava Madagascar.jpg"
    "public\images\madagascar\baobab-5.jpg"  = U "Adansonia grandidieri Morondava - 08.jpg"
    "public\images\madagascar\baobab-6.jpg"  = U "Adansonia grandidieri Morondava - 09.jpg"
    "public\images\madagascar\baobab-7.jpg"  = U "Adansonia grandidieri Morondava - 29.jpg"
    "public\images\madagascar\baobab-8.jpg"  = U "Adansonia grandidieri Morondava - 30.jpg"
    "public\images\madagascar\baobab-9.jpg"  = U "Adansonia grandidieri Morondava - 35.jpg"
    "public\images\madagascar\baobab-10.jpg" = U "Adansonia grandidieri01.jpg"
    "public\images\madagascar\baobab-11.jpg" = U "Baobab Avenue 1.JPG"
    "public\images\madagascar\baobab-12.jpg" = U "The Avenue of the Baobabs in Madagascar near the city of Morondava at sunrise (34).jpg"

    # --- Lemuriens (13) ---
    "public\images\madagascar\lemur-1.jpg"  = U "Ring-tailed lemur (Lemur catta).jpg"
    "public\images\madagascar\lemur-2.jpg"  = U "Ring-tailed lemur (Lemur catta) in tree.jpg"
    "public\images\madagascar\lemur-3.jpg"  = U "Ring-tailed Lemurs (Lemur catta) crossing the road in the evening (9613726131).jpg"
    "public\images\madagascar\lemur-4.jpg"  = U "Lemur-ring-tailed.JPG"
    "public\images\madagascar\lemur-5.jpg"  = U "Ring-Tailed Lemur (20520737365).jpg"
    "public\images\madagascar\lemur-6.jpg"  = U "Ring-tailed Lemur Lemurs Park Antananarivo Madagascar - panoramio.jpg"
    "public\images\madagascar\lemur-7.jpg"  = U "Ruffed Lemur Lemurs Park Antananarivo Madagascar - panoramio.jpg"
    "public\images\madagascar\lemur-8.jpg"  = U "Rufus mouse lemur.JPG"
    "public\images\madagascar\lemur-9.jpg"  = U "Tana Lemurs park1.jpg"
    "public\images\madagascar\lemur-10.jpg" = U "Tana Lemurs park2.jpg"
    "public\images\madagascar\lemur-11.jpg" = U "A.Furtado at Lemurs Park with a Coquerel's Sifaka.jpg"
    "public\images\madagascar\lemur-12.jpg" = U "Two lemurs in Tana lemurs park.jpg"
    "public\images\madagascar\lemur-13.jpg" = U "Brown Lemur Lemurs Park Antananarivo Madagascar - panoramio.jpg"

    # --- Cameleons (16) ---
    "public\images\madagascar\chameleon-1.jpg"  = U "Panther chameleon (Furcifer pardalis) male Nosy Be.jpg"
    "public\images\madagascar\chameleon-2.jpg"  = U "Parson's chameleon (Calumma parsonii cristifer) female Andasibe 2.jpg"
    "public\images\madagascar\chameleon-3.jpg"  = U "Short-horned chameleon (Calumma brevicorne) female Andasibe.jpg"
    "public\images\madagascar\chameleon-4.jpg"  = U "Chameleon in Berenty Madagascar 0001.JPG"
    "public\images\madagascar\chameleon-5.jpg"  = U "Amber Mountain National Park Panther Chameleon - panoramio.jpg"
    "public\images\madagascar\chameleon-6.jpg"  = U "Cameleon 2597a.JPG"
    "public\images\madagascar\chameleon-7.jpg"  = U "Cameleon, peyrieras 05.JPG"
    "public\images\madagascar\chameleon-8.jpg"  = U "Cameleon, peyrieras 06.JPG"
    "public\images\madagascar\chameleon-9.jpg"  = U "Cameleon, peyrieras 15.JPG"
    "public\images\madagascar\chameleon-10.jpg" = U "Cameleon, peyrieras 16.JPG"
    "public\images\madagascar\chameleon-11.jpg" = U "Cameleon, peyrieras 17.JPG"
    "public\images\madagascar\chameleon-12.jpg" = U "Reuzenkameleon in Isalo 1.JPG"
    "public\images\madagascar\chameleon-13.jpg" = U "Reuzenkameleon in Isalo 2.JPG"
    "public\images\madagascar\chameleon-14.jpg" = U "Reuzenkameleon in Isalo 3.JPG"
    "public\images\madagascar\chameleon-15.jpg" = U "Petter's chameleon (Furcifer petteri) male Montagne d'Ambre.jpg"
    "public\images\madagascar\chameleon-16.jpg" = U "Plated leaf chameleon (Brookesia stumpffi) Lokobe.jpg"

    # --- Antananarivo (15) ---
    "public\images\madagascar\tana-1.jpg"  = U "Ambohimitsinjo - panoramio.jpg"
    "public\images\madagascar\tana-2.jpg"  = U "Ansicht Antananarivo 2019-10-20 3.jpg"
    "public\images\madagascar\tana-3.jpg"  = U "Ansicht Antananarivo 2019-10-20.jpg"
    "public\images\madagascar\tana-4.jpg"  = U "Antananarivo (283044861).jpg"
    "public\images\madagascar\tana-5.jpg"  = U "Lake Anosy, Central Antananarivo, Capital of Madagascar, Photo by Sascha Grabow.jpg"
    "public\images\madagascar\tana-6.jpg"  = U "Landscape around Tananarive (3189647809).jpg"
    "public\images\madagascar\tana-7.jpg"  = U "Landscape around Tananarive (3189648527).jpg"
    "public\images\madagascar\tana-8.jpg"  = U "Antananarivo banner.jpg"
    "public\images\madagascar\tana-9.jpg"  = U "Antananarivo Capital de Madagascar.jpg"
    "public\images\madagascar\tana-10.jpg" = U "Antananarivo Street.JPG"
    "public\images\madagascar\tana-11.jpg" = U "Avenue de l'Independence Antananarivo Madagascar.JPG"
    "public\images\madagascar\tana-12.jpg" = U "Zebu (Ox) Cart in Antananarivo, Madagascar.jpg"
    "public\images\madagascar\tana-13.jpg" = U "Fishing in Downtown Antananarivo.jpg"
    "public\images\madagascar\tana-14.jpg" = U "Flower Market of Antananarivo.jpg"
    "public\images\madagascar\tana-15.jpg" = U "Ambohijatovo - Antananarivo.jpg"

    # --- Tsingy (6) ---
    "public\images\madagascar\tsingy-1.jpg" = U "Tsingy de Bemaraha.jpg"
    "public\images\madagascar\tsingy-2.jpg" = U "Tsingy de Bemaraha National Park, Madagascar.jpg"
    "public\images\madagascar\tsingy-3.jpg" = U "Tsingy de Bemaraha Strict Nature Reserve.jpg"
    "public\images\madagascar\tsingy-4.jpg" = U "Circuit Andamozavaky, Tsingy de Bemaraha, Madagascar.jpg"
    "public\images\madagascar\tsingy-5.jpg" = U "Close up of Little Tsingy.jpg"
    "public\images\madagascar\tsingy-6.jpg" = U "Conditions difficiles (25804718450).jpg"

    # --- Isalo (1) ---
    "public\images\madagascar\isalo-1.jpg" = U "Isalo National Park 01.jpg"

    # --- Andringitra (7) ---
    "public\images\madagascar\andringitra-1.jpg" = U "Andringitra (4990208433).jpg"
    "public\images\madagascar\andringitra-2.jpg" = U "Andringitra sunset - camp 1 (4990813258).jpg"
    "public\images\madagascar\andringitra-3.jpg" = U "Dawn on Andringitra (4990207251).jpg"
    "public\images\madagascar\andringitra-4.jpg" = U "Hillside in Andringitra, Madagascar.jpg"
    "public\images\madagascar\andringitra-5.jpg" = U "Pic Boby (1).jpg"
    "public\images\madagascar\andringitra-6.jpg" = U "Andringitra-gestein.jpg"
    "public\images\madagascar\andringitra-7.jpg" = U "Andringitra National Park WV Banner.jpg"

    # --- Ranomafana (11) ---
    "public\images\madagascar\ranomafana-1.jpg"  = U "The View From My Bathroom Window, Ranomafana (3953713236).jpg"
    "public\images\madagascar\ranomafana-2.jpg"  = U "Sign At Entrance To Ranomafana National Park.jpg"
    "public\images\madagascar\ranomafana-3.jpg"  = U "Swimmingpool Ranomafana I.jpg"
    "public\images\madagascar\ranomafana-4.jpg"  = U "Swimmingpool Ranomafana II.jpg"
    "public\images\madagascar\ranomafana-5.jpg"  = U "Thermal Baths, Ranomafana (3955534336).jpg"
    "public\images\madagascar\ranomafana-6.jpg"  = U "Destroyed bridge in Ranomafana I.jpg"
    "public\images\madagascar\ranomafana-7.jpg"  = U "Destroyed bridge in Ranomafana II.jpg"
    "public\images\madagascar\ranomafana-8.jpg"  = U "Namorona River in Ranomafana National Park 2013 5.jpg"
    "public\images\madagascar\ranomafana-9.jpg"  = U "Namorona River in Ranomafana National Park 2013 1.jpg"
    "public\images\madagascar\ranomafana-10.jpg" = U "Parque Nacional de Ranomafana Madagascar de 20171113 053617.jpg"
    "public\images\madagascar\ranomafana-11.jpg" = U "Ranomafana - Andriamamovoka falls.jpg"

    # --- Nosy Be (7) ---
    "public\images\madagascar\nosybe-1.jpg" = U "Nosy Be beach (3186856441).jpg"
    "public\images\madagascar\nosybe-2.jpg" = U "Nosy-iranja-beach.jpg"
    "public\images\madagascar\nosybe-3.jpg" = U "Nosy Be.jpg"
    "public\images\madagascar\nosybe-4.jpg" = U "Nosy Be Hell Ville 0551.jpg"
    "public\images\madagascar\nosybe-5.jpg" = U "Cascade de Nosy Be Hell ville, Madagascar.jpg"
    "public\images\madagascar\nosybe-6.jpg" = U "Ampasipohy, Nosy Be, Madagascar, 2025-09-21, DD 17.jpg"
    "public\images\madagascar\nosybe-7.jpg" = U "Église catholique st Pierre et Paul Nosy Be.jpg"

    # --- Portraits (6) ---
    "public\images\madagascar\portrait-1.jpg" = U "Nosy Be people 09.jpg"
    "public\images\madagascar\portrait-2.jpg" = U "A community in Nosey Be.jpg"
    "public\images\madagascar\portrait-3.jpg" = U "A young boy see a bulls.jpg"
    "public\images\madagascar\portrait-4.jpg" = U "Boy on the Beach near Anjajavy, Madgascar (3326809135).jpg"
    "public\images\madagascar\portrait-5.jpg" = U "Coiffures Malgache MPMF24.jpg"
    "public\images\madagascar\portrait-6.jpg" = U "Antsirabe I, Madagascar - panoramio.jpg"

    # --- Rural / villages (8) ---
    "public\images\madagascar\rural-1.jpg" = U "Village d'Antsahabe-Est Madagascar.jpg"
    "public\images\madagascar\rural-2.jpg" = U "Village typique de la région sofia Madagascar 01.jpg"
    "public\images\madagascar\rural-3.jpg" = U "Passage vers le village d'Ambalamahogo.jpg"
    "public\images\madagascar\rural-4.jpg" = U "Paysage agricole, Madagascar.jpg"
    "public\images\madagascar\rural-5.jpg" = U "Zebu Market Ambalavao Madagascar.jpg"
    "public\images\madagascar\rural-6.jpg" = U "Paysage dans le nord de Madagascar.jpg"
    "public\images\madagascar\rural-7.jpg" = U "Paysage dans le nord de Madagascar 2.jpg"
    "public\images\madagascar\rural-8.jpg" = U "Paysage dans la partie d'Ambohimanga.jpg"

    # --- Rizieres / terrasses (3) ---
    "public\images\madagascar\terrasse-1.jpg" = U "Madagascar - rice terraces.jpg"
    "public\images\madagascar\terrasse-2.jpg" = U "Madagascar - rice terraces (2).jpg"
    "public\images\madagascar\terrasse-3.jpg" = U "Ambinanintelo - rizières.jpg"

    # --- Art / artisanat (6) ---
    "public\images\art\lamba-weave-1.jpg" = U "Art Malagasy.jpg"
    "public\images\art\lamba-weave-2.jpg" = U "Art malgache.jpg"
    "public\images\art\lamba-weave-3.jpg" = U "Artisanat malagasy.jpg"
    "public\images\art\sculpture-1.jpg"   = U "Aristide Maria MHNT ETH AC 1176 Porte sculptée.jpg"
    "public\images\art\sculpture-2.jpg"   = U "Fondation H, Antananarivo Madagascar (10182).jpg"
    "public\images\art\sculpture-3.jpg"   = U "Fondation H, Antananarivo Madagascar (10623).jpg"

    # --- Vignettes categories generiques (reutilisent des fichiers ci-dessus) ---
    "public\images\categories\animal-1.jpg"   = U "Ring-tailed lemur (Lemur catta).jpg"
    "public\images\categories\building-1.jpg" = U "Antananarivo Capital de Madagascar.jpg"
    "public\images\categories\mountain-1.jpg" = U "Tsingy de Bemaraha.jpg"
    "public\images\categories\coast-1.jpg"    = U "Nosy Be beach (3186856441).jpg"
    "public\images\categories\coast-2.jpg"    = U "Nosy-iranja-beach.jpg"
    "public\images\categories\coast-3.jpg"    = U "Ampasipohy, Nosy Be, Madagascar, 2025-09-21, DD 17.jpg"

    # --- Racine (2) ---
    "public\images\hero.jpg"  = U "The Avenue of the Baobabs in Madagascar near the city of Morondava at sunrise (34).jpg"
    "public\images\isalo.jpg" = U "Isalo National Park 01.jpg"
}

$total = $files.Count
$i = 0
foreach ($entry in $files.GetEnumerator()) {
    $i++
    $dest = $entry.Key
    $url = $entry.Value
    $dir = Split-Path $dest -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    if ((Test-Path $dest) -and ((Get-Item $dest).Length -gt 0)) {
        Write-Host "[$i/$total] $dest (deja present, ignore)"
        continue
    }

    Write-Host "[$i/$total] $dest"
    $maxRetries = 3
    $attempt = 0
    $done = $false
    while (-not $done -and $attempt -lt $maxRetries) {
        $attempt++
        try {
            Invoke-WebRequest -Uri $url -OutFile $dest -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" -MaximumRedirection 5
            $done = $true
            Start-Sleep -Milliseconds 4000
        } catch {
            $msg = $_.Exception.Message
            if ($msg -match "429") {
                Write-Host "    429 - attente 15s avant nouvel essai ($attempt/$maxRetries)..." -ForegroundColor Yellow
                Start-Sleep -Seconds 15
            } else {
                Write-Host "  ECHEC : $url" -ForegroundColor Red
                Write-Host "    -> $msg" -ForegroundColor Yellow
                Start-Sleep -Milliseconds 4000
                break
            }
        }
    }
}

Write-Host "`nTermine. Verifie avec : npx tsx scripts/verify-images.ts"
Write-Host "Si des ECHEC subsistent, relance simplement ce script - il ignorera ce qui a deja reussi."
