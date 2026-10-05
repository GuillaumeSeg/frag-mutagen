#version 300 es
precision mediump float;

out vec4 out_color;
uniform vec2  u_resolution;
uniform float u_time;

float hash(float n){ return fract(sin(n) * 437566.5453123); }

float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float sdTriangle(vec2 p, vec2 a, vec2 b, vec2 c){
    vec2 e0=b-a, e1=c-b, e2=a-c;
    vec2 v0=p-a, v1=p-b, v2=p-c;
    vec2 pq0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.,1.);
    vec2 pq1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.,1.);
    vec2 pq2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.,1.);
    float s=sign(e0.x*e2.y-e0.y*e2.x);
    vec2 d=min(min(vec2(dot(pq0,pq0),s*(v0.x*e0.y-v0.y*e0.x)),
                   vec2(dot(pq1,pq1),s*(v1.x*e1.y-v1.y*e1.x))),
                   vec2(dot(pq2,pq2),s*(v2.x*e2.y-v2.y*e2.x)));
    return -sqrt(d.x)*sign(d.y);
}

// ── Glitch HIGH — chaotique, complètement instable ───────────────────────────
float glitchHigh(float y, float t, float seed){
    float frame=floor(t*16.0+seed*97.0);               // ~16 fps — très réactif
    if(hash(frame*0.31+seed*17.3)>0.40) return 0.0;   // bursts très fréquents : 40%
    float strip=floor(y*58.0);                          // bandes très fines et denses
    if(hash(strip*11.37+frame*2.13+seed)>0.60) return 0.0; // 60% des strips actives
    float mag=hash(strip*3.91+frame*7.53+seed*3.7)*0.2;   // amplitude max : 20%
    float dir=sign(hash(strip*5.17+frame*0.83+seed*2.1)-0.5);
    return mag*dir;
}

// ── Glitch MEDIUM — visible, perturbé ────────────────────────────────────────
float glitchMedium(float y, float t, float seed){
    float frame=floor(t*11.0+seed*97.0);               // ~11 fps
    if(hash(frame*0.31+seed*17.3)>0.20) return 0.0;   // bursts : 20%
    float strip=floor(y*48.0);                          // bandes intermédiaires
    if(hash(strip*11.37+frame*2.13+seed)>0.38) return 0.0; // 38% des strips actives
    float mag=hash(strip*3.91+frame*7.53+seed*3.7)*0.07;   // amplitude max : 7%
    float dir=sign(hash(strip*5.17+frame*0.83+seed*2.1)-0.5);
    return mag*dir;
}

// ── Glitch LOW — tremor discret, à peine perceptible ─────────────────────────
float glitchLow(float y, float t, float seed){
    float frame=floor(t*8.0+seed*97.0);                // ~8 fps — lent
    if(hash(frame*0.31+seed*17.3)>0.10) return 0.0;   // bursts rares : 10%
    float strip=floor(y*38.0);                          // peu de bandes, larges
    if(hash(strip*11.37+frame*2.13+seed)>0.22) return 0.0; // 22% des strips actives
    float mag=hash(strip*3.91+frame*7.53+seed*3.7)*0.02;   // amplitude max : 2%
    float dir=sign(hash(strip*5.17+frame*0.83+seed*2.1)-0.5);
    return mag*dir;
}

// ── EXPLOSION MUTÉE : périmètre de la tile -> point 2D ───────────────────────
// On déroule le contour [-0.5,0.5]^2 en un scalaire p in [0,1).
// 4 segments : bottom -> right -> top -> left.
vec2 perimeterPoint(float p){
    p = fract(p);                       // wrap sécurisé
    float q = p * 4.0;                  // quel bord ? 0..4
    float f = fract(q);                 // position le long du bord
    int   edge = int(floor(q));         // 0,1,2,3
    if(edge == 0) return vec2(-0.5 + f, -0.5); // bottom
    if(edge == 1) return vec2( 0.5,     -0.5 + f); // right
    if(edge == 2) return vec2( 0.5 - f,  0.5);     // top
    return             vec2(-0.5,       0.5 - f);  // left
}

// ── Tirage de 3 sommets DISTINCTS sur le périmètre (sans boucle infinie) ─────
void mutatedTriangle(float seed, out vec2 A, out vec2 B, out vec2 C){
    const float ND = 24.0;
    
    // On tire 3 valeurs distinctes via un shuffle déterministe
    float v0 = fract(hash(seed * 1.13 + 0.7) * 1000.0);
    float v1 = fract(hash(seed * 2.71 + 3.3) * 1000.0);
    float v2 = fract(hash(seed * 4.37 + 9.1) * 1000.0);
    
    // On les convertit en indices entiers distincts
    int i0 = int(floor(v0 * ND));
    int i1 = int(floor(v1 * ND));
    int i2 = int(floor(v2 * ND));
    
    // Assurance : si par hasard ils sont égaux, on décale
    if(i1 == i0) i1 = (i1 + 1) % int(ND);
    if(i2 == i0 || i2 == i1) i2 = (i2 + 1) % int(ND);
    
    A = perimeterPoint((float(i0) + 0.5) / ND);
    B = perimeterPoint((float(i1) + 0.5) / ND);
    C = perimeterPoint((float(i2) + 0.5) / ND);
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;

    const float N             = 8.0;
    const float GAP           = 0.0;
    const float MAX_TRIGGER   = 5.0;  // BASE   → LOW    (sec)
    const float MEDIUM_WINDOW = 5.0;  // LOW    → MEDIUM (sec, additionnel)
    const float HIGH_WINDOW   = 5.0;  // MEDIUM → HIGH   (sec, additionnel)
    const float MUTATE_WINDOW = 5.0;  // HIGH   → MUTATED (sec, additionnel)

    // ── Tiling ────────────────────────────────────────────────────────────────
    vec2 cellUV = fract(uv * N);
    vec2 cellID = floor(uv * N);
    float seed  = cellID.x + cellID.y * N;

    // ── State machine : BASE → LOW → MEDIUM → HIGH → MUTATED (one-way) ───────
    float triggerLow    = hash(seed * 7.13 + 3.7)  * MAX_TRIGGER;
    float triggerMedium = triggerLow    + hash(seed * 5.71 + 8.3)  * MEDIUM_WINDOW;
    float triggerHigh   = triggerMedium + hash(seed * 3.17 + 11.9) * HIGH_WINDOW;
    float triggerMutate = triggerHigh   + hash(seed * 9.53 + 5.1)  * MUTATE_WINDOW;

    bool isLow     = u_time > triggerLow;
    bool isMedium  = u_time > triggerMedium;
    bool isHigh    = u_time > triggerHigh;
    bool isMutated = u_time > triggerMutate;

    vec2 local = cellUV - 0.5;

    // ── MIRROR CONFIGURATIONS ────────────────────────────────────────────────
    // Décommentez UNE seule des lignes ci-dessous pour choisir le mode :

    // (A) Aligned (aucun mirror)
     bool mirror = false;
    // (B) Aligned Mirror (tout mirrored)
     //bool mirror = true;
    // (C) Mirror Line (1 ligne sur 2)
    //bool mirror = mod(cellID.y, 2.0) > 0.5;
    // (D) Mirror Column (1 colonne sur 2)
    //bool mirror = mod(cellID.x, 2.0) > 0.5;
    // (E) TRON Style (Damier / Checkerboard)
    // bool mirror = mod(cellID.x + cellID.y, 2.0) > 0.5;
    // (F) Random (Aléatoire : 1 chance sur 2)
    // bool mirror = hash2(cellID) > 0.5;

    if(mirror) local.y = -local.y;

    // ── Déplacement glitch + CA scale selon état ──────────────────────────────
    float dx;
    float caScale;

    if(isMutated){
        // post-explosion : plus de shake horizontal, forme figée mais "morte"
        dx      = 0.0;
        caScale = 0.0;
    } else if(isHigh){
        dx      = glitchHigh(uv.y, u_time, seed);
        caScale = 20.0;
    } else if(isMedium){
        dx      = glitchMedium(uv.y, u_time, seed);
        caScale = 10.0;
    } else if(isLow){
        dx      = glitchLow(uv.y, u_time, seed);
        caScale = 4.0;
    } else {
        dx      = 0.0;
        caScale = 0.0;
    }

    local.x -= dx;

    // ── Triangle : base à (-0.5 + GAP), apex à +0.5 ──────────────────────────
    vec2 tA = vec2(-0.5, -0.5 + GAP);
    vec2 tB = vec2( 0.5, -0.5 + GAP);
    vec2 tC = vec2( 0.0,  0.5);

    // ── Explosion : si muté, on remplace les sommets par ceux du périmètre ───
    if(isMutated){
        vec2 mA, mB, mC;
        mutatedTriangle(seed, mA, mB, mC);
        float triArea = abs((mB.x - mA.x) * (mC.y - mA.y) - (mC.x - mA.x) * (mB.y - mA.y));
        if(triArea < 0.01){
            // Triangle trop petit / dégénéré, on force un triangle valide
            mA = vec2(-0.4, -0.4);
            mB = vec2( 0.4, -0.4);
            mC = vec2( 0.0,  0.4);
        }
        tA = mA; tB = mB; tC = mC;
    }

    float fill  = step(sdTriangle(local,                             tA, tB, tC), 0.0);
    float ca    = abs(dx) * caScale;
    float fillR = step(sdTriangle(local + vec2( ca*0.018, 0.0), tA, tB, tC), 0.0);
    float fillB = step(sdTriangle(local + vec2(-ca*0.018, 0.0), tA, tB, tC), 0.0);

    // ── Assemblage ────────────────────────────────────────────────────────────
    vec3 couleur = vec3(0.05);
    couleur.r = mix(couleur.r, 1.0, fillR);
    couleur.g = mix(couleur.g, 1.0, fill);
    couleur.b = mix(couleur.b, 1.0, fillB);

    // Scanlines + grain : intensité croissante par état
    if(isMutated){
        // après l'explosion : image "cendrée", scanline forte + gros grain
        couleur *= 1.0 - sin(gl_FragCoord.y * 3.14159) * 0.10;
        float grain = (hash(dot(uv*u_resolution, vec2(127.1,311.7))+u_time*31.7)-0.5)*0.05;
        couleur = clamp(couleur + grain, 0.0, 1.0);
    } else if(isHigh){
        couleur *= 1.0 - sin(gl_FragCoord.y * 3.14159) * 0.07;
        float grain = (hash(dot(uv*u_resolution, vec2(127.1,311.7))+u_time*31.7)-0.5)*0.035;
        couleur = clamp(couleur + grain, 0.0, 1.0);
    } else if(isMedium){
        couleur *= 1.0 - sin(gl_FragCoord.y * 3.14159) * 0.04;
        float grain = (hash(dot(uv*u_resolution, vec2(127.1,311.7))+u_time*31.7)-0.5)*0.020;
        couleur = clamp(couleur + grain, 0.0, 1.0);
    } else if(isLow){
        couleur *= 1.0 - sin(gl_FragCoord.y * 3.14159) * 0.02;
        float grain = (hash(dot(uv*u_resolution, vec2(127.1,311.7))+u_time*31.7)-0.5)*0.010;
        couleur = clamp(couleur + grain, 0.0, 1.0);
    }

    couleur = clamp(couleur, 0.0, 1.0);

    out_color = vec4(couleur, 1.0);
}