(function () {
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const fileRow = document.getElementById('fileRow');
  const fileNameEl = document.getElementById('fileName');
  const fileSizeEl = document.getElementById('fileSize');
  const orderStep = document.getElementById('orderStep');
  const plateOrderEl = document.getElementById('plateOrder');
  const repsInput = document.getElementById('reps');
  const processBtn = document.getElementById('processBtn');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const downloadLink = document.getElementById('downloadLink');

  // state.plates: original scan, used to find the plate_1 slot to write into.
  // state.order: user-orderable/toggleable working list rendered as cards.
  let state = null; // { file, zip, plates: [{num, path}], order: [{num, path, thumbPath, thumbUrl, enabled}] }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  ['dragover', 'dragenter'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); });
  });
  dropzone.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function revokeThumbUrls() {
    if (!state || !state.order) return;
    for (const p of state.order) {
      if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
    }
  }

  async function handleFile(file) {
    resultEl.hidden = true;
    orderStep.hidden = true;
    plateOrderEl.innerHTML = '';
    processBtn.disabled = true;
    revokeThumbUrls();
    state = null;

    if (!/\.3mf$/i.test(file.name)) {
      setStatus('That doesn\'t look like a .3mf file.', 'error');
      return;
    }

    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = fmtSize(file.size);
    fileRow.hidden = false;

    setStatus('Reading archive…');
    try {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);

      const plateRe = /^Metadata\/(?:.*\/)?plate_(\d+)\.gcode$/i;
      const plates = [];
      zip.forEach((relPath, entry) => {
        if (entry.dir) return;
        const m = relPath.match(plateRe);
        if (m) plates.push({ num: parseInt(m[1], 10), path: relPath });
      });

      if (plates.length === 0) {
        setStatus('No plate_X.gcode files found inside Metadata/.', 'error');
        return;
      }

      plates.sort((a, b) => a.num - b.num);

      // Match plate_X.png / plate_X_small.png thumbnails to plate numbers.
      // Prefer the small preview since it's what's used as a thumbnail.
      const thumbRe = /^Metadata\/(?:.*\/)?plate_(\d+)(_small)?\.png$/i;
      const thumbMap = {};
      zip.forEach((relPath, entry) => {
        if (entry.dir) return;
        const m = relPath.match(thumbRe);
        if (!m) return;
        const num = parseInt(m[1], 10);
        thumbMap[num] = thumbMap[num] || {};
        if (m[2]) thumbMap[num].small = relPath; else thumbMap[num].full = relPath;
      });

      const order = plates.map(p => ({
        num: p.num,
        path: p.path,
        thumbPath: (thumbMap[p.num] && (thumbMap[p.num].small || thumbMap[p.num].full)) || null,
        thumbUrl: null,
        enabled: true,
      }));

      state = { file, zip, plates, order };

      orderStep.hidden = false;
      renderPlateOrder();
      setStatus(`Found ${plates.length} plate${plates.length > 1 ? 's' : ''}. Ready to merge.`, 'success');
      processBtn.disabled = false;

      loadThumbnails();
    } catch (err) {
      console.error(err);
      setStatus('Could not read that file: ' + err.message, 'error');
    }
  }

  async function loadThumbnails() {
    if (!state) return;
    const { zip, order } = state;
    for (const p of order) {
      if (!p.thumbPath) continue;
      try {
        const blob = await zip.file(p.thumbPath).async('blob');
        if (!state || state.order !== order) return; // a new file was loaded meanwhile
        p.thumbUrl = URL.createObjectURL(blob);
        renderPlateOrder();
      } catch (err) {
        // Thumbnail missing or unreadable — leave the placeholder icon in place.
      }
    }
  }

  function renderPlateOrder() {
    if (!state) return;
    plateOrderEl.innerHTML = '';

    state.order.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'plate-card' + (p.enabled ? '' : ' disabled');
      card.draggable = true;
      card.dataset.index = String(idx);

      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '⋮⋮';
      handle.setAttribute('aria-hidden', 'true');

      let thumbEl;
      if (p.thumbUrl) {
        thumbEl = document.createElement('img');
        thumbEl.className = 'thumb';
        thumbEl.src = p.thumbUrl;
        thumbEl.alt = `plate_${p.num} thumbnail`;
      } else {
        thumbEl = document.createElement('div');
        thumbEl.className = 'thumb-ph' + (p.thumbPath ? ' loading' : '');
        thumbEl.textContent = p.thumbPath ? '⋯' : '—';
      }

      const meta = document.createElement('div');
      meta.className = 'plate-meta';
      const orderNum = document.createElement('span');
      orderNum.className = 'plate-order-num';
      orderNum.textContent = `POSITION ${idx + 1}`;
      const label = document.createElement('span');
      label.className = 'plate-label';
      label.textContent = `plate_${p.num}.gcode`;
      meta.appendChild(orderNum);
      meta.appendChild(label);

      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'toggle';
      toggleLabel.setAttribute('aria-label', `Include plate_${p.num}.gcode in merge`);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = p.enabled;
      cb.addEventListener('change', () => {
        p.enabled = cb.checked;
        card.classList.toggle('disabled', !p.enabled);
      });
      const track = document.createElement('span');
      track.className = 'toggle-track';
      const thumbDot = document.createElement('span');
      thumbDot.className = 'toggle-thumb';
      track.appendChild(thumbDot);
      toggleLabel.appendChild(cb);
      toggleLabel.appendChild(track);

      card.appendChild(handle);
      card.appendChild(thumbEl);
      card.appendChild(meta);
      card.appendChild(toggleLabel);

      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = parseInt(card.dataset.index, 10);
        if (isNaN(fromIdx) || fromIdx === toIdx) return;
        const [moved] = state.order.splice(fromIdx, 1);
        state.order.splice(toIdx, 0, moved);
        renderPlateOrder();
      });

      plateOrderEl.appendChild(card);
    });
  }

  processBtn.addEventListener('click', async () => {
    if (!state) return;
    processBtn.disabled = true;
    resultEl.hidden = true;

    try {
      const { file, zip, plates, order } = state;

      const enabled = order.filter(p => p.enabled);
      if (enabled.length === 0) {
        setStatus('Turn on at least one plate to merge.', 'error');
        processBtn.disabled = false;
        return;
      }

      // A literal newline blob used as a separator. Blob concatenation via
      // `new Blob([...])` is a lazy, reference-based join in the browser —
      // it does not copy the underlying bytes — so this stays cheap however
      // many millions of lines are inside, unlike string `+` or `.repeat()`.
      const NL = new Blob(['\n']);

      // Read and join only the enabled plates, in the order shown on screen —
      // no need to fold through disabled plates or force ascending order.
      const parts = [];
      for (let idx = 0; idx < enabled.length; idx++) {
        const p = enabled[idx];
        setStatus(`Reading plate_${p.num}.gcode (${idx + 1}/${enabled.length})…`);
        if (idx > 0) parts.push(NL);
        parts.push(await zip.file(p.path).async('blob'));
      }
      setStatus('Merging plate contents…');
      let finalContent = new Blob(parts);

      const reps = Math.max(1, parseInt(repsInput.value, 10) || 1);
      if (reps > 1) {
        const repeated = [];
        for (let r = 0; r < reps; r++) {
          if (r > 0) repeated.push(NL);
          repeated.push(finalContent);
        }
        finalContent = new Blob(repeated);
      }

      // Write the merged result into the plate_1.gcode slot (falling back to
      // the lowest-numbered plate if for some reason there's no plate 1),
      // and drop every other plate_X.gcode from the archive.
      const keepEntry = plates.find(p => p.num === 1) || plates[0];
      const keepPath = keepEntry.path;
      for (const p of plates) {
        if (p.path !== keepPath) zip.remove(p.path);
      }
      zip.file(keepPath, finalContent);

      setStatus('Packing archive… 0%');
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } },
        (meta) => setStatus(`Packing archive… ${Math.round(meta.percent)}%`)
      );

      let outName = file.name.replace(/\.gcode\.3mf$/i, '_combined.gcode.3mf');
      if (outName === file.name) outName = file.name.replace(/\.3mf$/i, '_combined.3mf');

      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = outName;
      downloadLink.textContent = `Download ${outName}`;
      resultEl.hidden = false;

      setStatus(`Done — merged ${enabled.length} plate${enabled.length > 1 ? 's' : ''}${reps > 1 ? ` × ${reps} repeat${reps > 1 ? 's' : ''}` : ''}.`, 'success');
    } catch (err) {
      console.error(err);
      setStatus('Merge failed: ' + err.message, 'error');
    } finally {
      processBtn.disabled = false;
    }
  });
})();
