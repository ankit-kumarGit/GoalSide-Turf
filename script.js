// ===============================
    // Utilities
    // ===============================
    const $ = (sel, root=document) => root.querySelector(sel);
    const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
    const storageKey = 'turfBookings_v1';

    const todayStr = () => new Date().toISOString().slice(0,10);
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    const fmtTime = h => {
      const am = h < 12 ? 'AM' : 'PM';
      const hr = ((h + 11) % 12) + 1; // 0→12, 13→1
      return `${hr}:00 ${am}`;
    };

    const baseRate = size => size === '7' ? 1200 : 800;
    const isPeakHour = h => h >= 18 && h <= 21; // 6–9 PM inclusive

    const calcPrice = (size, startHour, hours, couponCode) => {
      const base = baseRate(size) * hours;
      // Peak multiplier if ANY hour overlaps peak
      let peak = false;
      for (let i = 0; i < hours; i++) if (isPeakHour(startHour + i)) peak = true;
      let total = base * (peak ? 1.25 : 1);
      let applied = null;
      if (couponCode && couponCode.toUpperCase() === 'TURF10') { total *= 0.9; applied = 'TURF10'; }
      return { total: Math.round(total), peak, applied };
    };

    const load = () => JSON.parse(localStorage.getItem(storageKey) || '[]');
    const save = (arr) => localStorage.setItem(storageKey, JSON.stringify(arr));

    const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1800); };

    // Overlap check: [s, s+d) intersects [b, b+d)
    const overlaps = (s, d, b, bd) => Math.max(s, b) < Math.min(s + d, b + bd);

    // ===============================
    // State
    // ===============================
    let bookings = load();
    let selected = { start: null }; // hour int
    let couponApplied = null;

    // ===============================
    // Theme (Dark/Light)
    // ===============================
    const themeLabel = $('#themeLabel');
    const darkToggle = $('#darkToggle');

    // Load theme from storage or OS preference
    const savedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const initialTheme = savedTheme || (prefersLight ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', initialTheme);
    darkToggle.checked = initialTheme === 'dark';
    themeLabel.textContent = initialTheme === 'dark' ? 'Dark' : 'Light';

    darkToggle.addEventListener('change', (e)=>{
      const on = e.target.checked; // checked = dark
      const next = on ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      themeLabel.textContent = on ? 'Dark' : 'Light';
    });

    // Mobile menu + CTA
    $('#hamburger').addEventListener('click', ()=> $('#mobileMenu').classList.toggle('open'));
    $$('#mobileMenu a').forEach(a=> a.addEventListener('click', ()=> $('#mobileMenu').classList.remove('open')));
    $('#primaryCta').addEventListener('click', () => location.hash = '#booking');
    $('#year').textContent = new Date().getFullYear();

    // ===============================
    // HERO VIDEO: autoplay fallback
    // ===============================
    const hv = $('#heroVideo');
    // Ensure muted + playsinline to satisfy autoplay policies
    hv.muted = true; hv.playsInline = true; hv.setAttribute('muted', '');
    const tryPlay = () => {
      const p = hv.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => {
          // If autoplay fails (e.g., file:// or policy), show controls
          hv.controls = true;
        });
      }
    };
    hv.addEventListener('canplay', tryPlay, { once: true });
    // Also attempt immediately
    tryPlay();
    hv.addEventListener('error', () => {
      console.warn('Hero video failed to load. Check assets/hero.mp4 path.');
    });

    // ===============================
    // Booking form wiring
    // ===============================
    const nameEl = $('#name');
    const dateEl = $('#date');
    const turfEl = $('#turf');
    const playersEl = $('#players');
    const durationEl = $('#duration');
    const slotGrid = $('#slotGrid');
    const totalEl = $('#total');
    const couponEl = $('#coupon');

    const sName = $('#s-name'), sDate = $('#s-date'), sTurf = $('#s-turf'), sPlayers = $('#s-players'), sDur = $('#s-duration'), sStart = $('#s-start'), sPrice = $('#s-price');
    const peakNote = $('#peakNote');

    dateEl.min = todayStr();

    const hours = Array.from({length: 17}, (_,i)=> i + 6); // 6 → 22

    const renderSlots = () => {
      slotGrid.innerHTML = '';
      selected.start = null;
      const d = dateEl.value;
      const size = turfEl.value;
      const dur = Number(durationEl.value);
      if (!d || !size) { totalEl.textContent = '₹0'; updateSummary(); return; }

      // Disable starts that would overflow closing time (22:00 last hour start)
      const maxStart = 22 - (dur - 1);

      hours.forEach(h => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'slot'; btn.textContent = fmtTime(h);

        let disabled = h > maxStart;
        if (!disabled) {
          // Check overlaps against existing bookings same date+size
          const dayBooks = bookings.filter(b => b.date === d && b.turf === size);
          const conflict = dayBooks.some(b => overlaps(h, dur, b.start, b.duration));
          if (conflict) disabled = true;
        }
        if (disabled) btn.classList.add('disabled');
        else {
          btn.addEventListener('click', () => {
            $$('.slot').forEach(s=>s.classList.remove('selected'));
            btn.classList.add('selected');
            selected.start = h;
            updatePrice();
            updateSummary();
          });
        }
        slotGrid.appendChild(btn);
      });

      updatePrice();
      updateSummary();
    };

    const updatePrice = () => {
      const size = turfEl.value, d = Number(durationEl.value), h = selected.start;
      if (!size || !d || h === null) { totalEl.textContent = '₹0'; peakNote.style.display = 'none'; return; }
      const { total, peak } = calcPrice(size, h, d, couponApplied);
      totalEl.textContent = '₹' + total.toLocaleString('en-IN');
      peakNote.style.display = peak ? 'inline-block' : 'none';
    };

    const updateSummary = () => {
      sName.textContent = nameEl.value || '—';
      sDate.textContent = dateEl.value || '—';
      sTurf.textContent = turfEl.value ? (turfEl.value==='7' ? '7‑a‑side' : '5‑a‑side') : '—';
      sPlayers.textContent = playersEl.value || '—';
      sDur.textContent = (durationEl.value || '—') + (durationEl.value ? ' hr' : '');
      sStart.textContent = selected.start !== null ? fmtTime(selected.start) : '—';
      sPrice.textContent = totalEl.textContent;
    };

    [nameEl, dateEl, turfEl, playersEl, durationEl].forEach(el => el.addEventListener('input', ()=>{ renderSlots(); updateSummary(); }));

    $('#applyCoupon').addEventListener('click', ()=>{
      const code = couponEl.value.trim().toUpperCase();
      if (!code) return toast('Enter a coupon');
      if (code !== 'TURF10') return toast('Invalid code');
      couponApplied = 'TURF10';
      toast('Coupon TURF10 applied (10% off)');
      updatePrice(); updateSummary();
    });

    $('#clearBtn').addEventListener('click', ()=>{
      nameEl.value = '';
      dateEl.value = '';
      turfEl.value = '';
      playersEl.value = 10;
      durationEl.value = 1;
      couponEl.value = '';
      couponApplied = null; selected.start = null; renderSlots(); updateSummary();
    });

    // ===============================
    // Modal Review + Confirm
    // ===============================
    const openModal = () => $('#modal').classList.add('open');
    const closeModal = () => $('#modal').classList.remove('open');

    $('#reviewBtn').addEventListener('click', ()=>{
      // basic validation
      if (!nameEl.value || !dateEl.value || !turfEl.value || selected.start===null) return toast('Fill all fields & select a start');
      const dur = Number(durationEl.value);
      const size = turfEl.value;
      const { total } = calcPrice(size, selected.start, dur, couponApplied);
      $('#mName').textContent = nameEl.value;
      $('#mDate').textContent = dateEl.value;
      $('#mStart').textContent = fmtTime(selected.start);
      $('#mDur').textContent = dur + ' hr';
      $('#mTurf').textContent = size==='7' ? '7‑a‑side' : '5‑a‑side';
      $('#mPlayers').textContent = playersEl.value;
      $('#mTotal').textContent = '₹' + total.toLocaleString('en-IN');
      openModal();
    });

    $('#closeModal').addEventListener('click', closeModal);
    $('#cancelBtn').addEventListener('click', closeModal);

    $('#confirmBtn').addEventListener('click', ()=>{
      const size = turfEl.value; const dur = Number(durationEl.value);
      // Re-check conflict to be safe
      const dayBooks = bookings.filter(b => b.date === dateEl.value && b.turf === size);
      const conflict = dayBooks.some(b => overlaps(selected.start, dur, b.start, b.duration));
      if (conflict) { toast('Slot just got taken. Pick another.'); closeModal(); renderSlots(); return; }

      const { total, peak, applied } = calcPrice(size, selected.start, dur, couponApplied);
      const record = {
        id: Date.now(),
        name: nameEl.value.trim(),
        date: dateEl.value,
        start: selected.start,
        duration: dur,
        turf: size,
        players: clamp(parseInt(playersEl.value||10), 2, 20),
        total,
        coupon: applied
      };
      bookings.push(record); save(bookings);
      closeModal(); toast('Booking confirmed!');
      renderSlots(); updateSummary(); renderTable();
    });

    // Initial render
    dateEl.value = todayStr(); renderSlots(); updateSummary();

    // ===============================
    // Testimonials slider
    // ===============================
    const track = $('#tTrack'); const dots = $$('.dot'); let idx = 0;
    const go = (i)=>{ idx = i; track.style.transform = `translateX(-${i*100}%)`; dots.forEach((d,j)=> d.classList.toggle('active', j===i)); };
    dots.forEach(d=> d.addEventListener('click', ()=> go(parseInt(d.dataset.i))));
    go(0); setInterval(()=> go((idx+1)%3), 5000);

    // ===============================
    // Bookings table + filters
    // ===============================
    const rows = $('#rows'); const q = $('#q'); const fTurf = $('#fTurf');
    const renderTable = () => {
      rows.innerHTML = '';
      const query = q.value.trim().toLowerCase();
      const tFilter = fTurf.value;
      bookings
        .filter(b => !tFilter || b.turf === tFilter)
        .filter(b => !query || b.name.toLowerCase().includes(query) || b.date.includes(query))
        .sort((a,b)=> (a.date.localeCompare(b.date) || a.start-b.start))
        .forEach(b => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${b.name}</td>
            <td><span class="chip">${b.date}</span></td>
            <td>${fmtTime(b.start)}</td>
            <td>${b.duration}h</td>
            <td>${b.turf==='7'?'7v7':'5v5'}</td>
            <td>${b.players}</td>
            <td>₹${b.total.toLocaleString('en-IN')}</td>
            <td style="display:flex; gap:6px; flex-wrap:wrap">
              <button class="action" data-act="res" data-id="${b.id}">Reschedule</button>
              <button class="action danger" data-act="del" data-id="${b.id}">Cancel</button>
            </td>`;
          rows.appendChild(tr);
        });
    };

    const byId = id => bookings.find(b=> b.id===id);

    $('#table').addEventListener('click', e=>{
      const btn = e.target.closest('button'); if (!btn) return;
      const id = Number(btn.dataset.id); const act = btn.dataset.act; const rec = byId(id);
      if (!rec) return;
      if (act==='del') {
        if (!confirm('Cancel this booking?')) return;
        bookings = bookings.filter(b=> b.id!==id); save(bookings); renderTable(); renderSlots(); toast('Booking cancelled');
      }
      if (act==='res') {
        // Prefill the booking form for quick reschedule
        nameEl.value = rec.name; dateEl.value = rec.date; turfEl.value = rec.turf; playersEl.value = rec.players; durationEl.value = rec.duration; couponEl.value = rec.coupon||''; couponApplied = rec.coupon||null;
        selected.start = null; renderSlots(); updateSummary(); location.hash = '#booking'; toast('Pick a new start time & confirm');
      }
    });

    q.addEventListener('input', renderTable); fTurf.addEventListener('change', renderTable);

    $('#exportBtn').addEventListener('click', ()=>{
      const blob = new Blob([JSON.stringify(bookings, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'turf-bookings.json'; a.click(); URL.revokeObjectURL(url);
    });

    renderTable();