(() => {
      const STORAGE_KEY = 'ielts-writing-practice-current-v1';
      const EMERGENCY_KEY = 'ielts-writing-practice-emergency-v1';
      const HISTORY_KEY = 'ielts-writing-practice-history-v1';
      const DELETED_HISTORY_KEY = 'ielts-writing-practice-deleted-history-v1';
      const SPELLCHECK_KEY = 'ielts-writing-practice-spellcheck-v1';
      const DATABASE_NAME = 'ielts-writing-practice-database';
      const DATABASE_VERSION = 1;
      const REVISION_INTERVAL_MS = 30000;
      const REVISION_LIMIT = 240;
      const questionSets = window.IELTS_QUESTION_BANK?.questionSets;
      if (!Array.isArray(questionSets) || questionSets.length === 0) {
        throw new Error('Question bank failed to load.');
      }
      const prompts = {
        task1: questionSets.map((item) => ({ title: item.id, label: `${item.id} · ${item.task1.category}`, text: item.task1.text, image: item.task1.image })),
        task2: questionSets.map((item) => ({ title: item.id, label: `${item.id} · ${item.task2.category}`, text: item.task2.text }))
      };
      const defaultQuestionSet = questionSets[0];
      const defaultQuestions = {
        task1: defaultQuestionSet.task1.text,
        task2: defaultQuestionSet.task2.text
      };
      const defaultQuestionTitles = { task1: defaultQuestionSet.id, task2: defaultQuestionSet.id };

      const $ = (id) => document.getElementById(id);
      const els = {
        appShell: document.querySelector('.app-shell'),
        promptCard: $('promptCard'), promptText: $('promptText'), titleInput: $('titleInput'), questionSetSelect: $('questionSetSelect'),
        taskImagePanel: $('taskImagePanel'), imageDropzone: $('imageDropzone'),
        imageEmpty: $('imageEmpty'), promptImage: $('promptImage'), promptImageInput: $('promptImageInput'),
        imageActions: $('imageActions'), replaceImageButton: $('replaceImageButton'), removeImageButton: $('removeImageButton'),
        writingArea: $('writingArea'), writingHighlights: $('writingHighlights'), highlightButton: $('highlightButton'),
        timerCard: $('timerCard'), timerValue: $('timerValue'),
        timerState: $('timerState'), timerToggle: $('timerToggle'), timerReset: $('timerReset'),
        wordCount: $('wordCount'), targetCount: $('targetCount'), targetHint: $('targetHint'),
        charCount: $('charCount'), paragraphCount: $('paragraphCount'), progressBar: $('progressBar'),
        backupButton: $('backupButton'), spellcheckButton: $('spellcheckButton'), printButton: $('printButton'), historyModal: $('historyModal'),
        printSheet: $('printSheet'), printTask: $('printTask'), printTitle: $('printTitle'), printMeta: $('printMeta'),
        printQuestion: $('printQuestion'), printQuestionImage: $('printQuestionImage'), printAnswer: $('printAnswer'),
        historyButton: $('historyButton'), closeHistoryButton: $('closeHistoryButton'), historyList: $('historyList'), toast: $('toast')
      };

      let state = {
        task: 'task2', promptIndex: 0, questionSetId: defaultQuestionSet.id, title: defaultQuestionSet.id, content: '', highlights: [], elapsed: 0, isRunning: false,
        startedAt: null, updatedAt: null, questions: { ...defaultQuestions }, questionTitles: { ...defaultQuestionTitles },
        promptImage: `bank:${defaultQuestionSet.id}`, practiceId: createPracticeId()
      };
      let timerHandle = null;
      let saveHandle = null;
      let toastHandle = null;
      let databasePromise = null;
      let persistenceReady = Promise.resolve();
      let historyCache = [];
      let historyDatabaseAvailable = false;
      let unsyncedHistoryIds = new Set();
      let lastRevisionSignature = '';
      let lastRevisionSavedAt = 0;
      let lastRevisionPracticeId = '';
      let pendingRevisionSignature = '';
      let queuedRevision = null;
      let revisionTimer = null;
      let revisionWriteCount = 0;
      let imageRequestVersion = 0;
      let imageRequestPending = false;
      let highlightResizeObserver = null;
      let focusBeforeHistory = null;
      let applicationReady = false;
      let transitionBusy = false;
      let spellcheckEnabled = readLocal(SPELLCHECK_KEY) === 'true';

      function createPracticeId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
      function safeText(value) { return typeof value === 'string' ? value : (value == null ? '' : String(value)); }
      function normalizeTask(value) { return value === 'task1' ? 'task1' : 'task2'; }
      function normalizeSeconds(value) { return Math.max(0, Math.floor(Number(value) || 0)); }

      function normalizeHighlights(value, textLength) {
        const max = Math.max(0, Math.floor(Number(textLength) || 0));
        if (!Array.isArray(value) || max === 0) return [];
        const ranges = value.map((range) => {
          const startValue = Number(range?.start);
          const endValue = Number(range?.end);
          if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return null;
          const start = Math.min(max, Math.max(0, Math.floor(startValue)));
          const end = Math.min(max, Math.max(0, Math.floor(endValue)));
          return end > start ? { start, end } : null;
        }).filter(Boolean).sort((a, b) => a.start - b.start || a.end - b.end);
        return ranges.reduce((merged, range) => {
          const previous = merged[merged.length - 1];
          if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
          else merged.push({ ...range });
          return merged;
        }, []);
      }

      function removeHighlightRange(ranges, start, end, textLength) {
        const remaining = [];
        normalizeHighlights(ranges, textLength).forEach((range) => {
          if (range.end <= start || range.start >= end) remaining.push(range);
          else {
            if (range.start < start) remaining.push({ start: range.start, end: start });
            if (range.end > end) remaining.push({ start: end, end: range.end });
          }
        });
        return normalizeHighlights(remaining, textLength);
      }

      function adjustHighlightsForEdit(ranges, oldText, newText) {
        oldText = safeText(oldText);
        newText = safeText(newText);
        if (oldText === newText) return normalizeHighlights(ranges, newText.length);
        let prefix = 0;
        const sharedLength = Math.min(oldText.length, newText.length);
        while (prefix < sharedLength && oldText[prefix] === newText[prefix]) prefix += 1;
        let suffix = 0;
        while (
          suffix < oldText.length - prefix
          && suffix < newText.length - prefix
          && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
        ) suffix += 1;
        const oldEnd = oldText.length - suffix;
        const newEnd = newText.length - suffix;
        const delta = newText.length - oldText.length;
        const mapStart = (position) => {
          if (position <= prefix) return position;
          if (position >= oldEnd) return position + delta;
          return prefix;
        };
        const mapEnd = (position) => {
          if (position <= prefix) return position;
          if (position >= oldEnd) return position + delta;
          return newEnd;
        };
        return normalizeHighlights(normalizeHighlights(ranges, oldText.length).map((range) => ({
          start: mapStart(range.start),
          end: mapEnd(range.end)
        })), newText.length);
      }

      function appendHighlightedText(container, value, ranges, preserveTrailingLine = false) {
        const text = safeText(value);
        const normalized = normalizeHighlights(ranges, text.length);
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        normalized.forEach((range) => {
          if (range.start > cursor) fragment.append(document.createTextNode(text.slice(cursor, range.start)));
          const mark = document.createElement('mark');
          mark.textContent = text.slice(range.start, range.end);
          fragment.append(mark);
          cursor = range.end;
        });
        if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
        if (preserveTrailingLine && text.endsWith('\n')) fragment.append(document.createTextNode('\u200b'));
        container.replaceChildren(fragment);
      }

      function syncHighlightLayer() {
        els.writingHighlights.style.width = `${els.writingArea.clientWidth}px`;
        els.writingHighlights.style.height = `${els.writingArea.clientHeight}px`;
        els.writingHighlights.scrollTop = els.writingArea.scrollTop;
        els.writingHighlights.scrollLeft = els.writingArea.scrollLeft;
      }

      function renderHighlights() {
        state.highlights = normalizeHighlights(state.highlights, els.writingArea.value.length);
        appendHighlightedText(els.writingHighlights, els.writingArea.value, state.highlights, true);
        syncHighlightLayer();
      }

      function toggleHighlight() {
        const start = els.writingArea.selectionStart;
        const end = els.writingArea.selectionEnd;
        const direction = els.writingArea.selectionDirection;
        const scrollTop = els.writingArea.scrollTop;
        const scrollLeft = els.writingArea.scrollLeft;
        if (start === end) {
          showToast('请先选中文字');
          els.writingArea.focus({ preventScroll: true });
          return;
        }
        const textLength = els.writingArea.value.length;
        const current = normalizeHighlights(state.highlights, textLength);
        const highlighted = current.some((range) => range.start <= start && range.end >= end);
        state.highlights = highlighted
          ? removeHighlightRange(current, start, end, textLength)
          : normalizeHighlights([...current, { start, end }], textLength);
        renderHighlights();
        saveEmergencyDraft();
        saveCurrent(true);
        els.writingArea.focus({ preventScroll: true });
        els.writingArea.setSelectionRange(start, end, direction);
        els.writingArea.scrollTop = scrollTop;
        els.writingArea.scrollLeft = scrollLeft;
        syncHighlightLayer();
        showToast(highlighted ? '已取消荧光' : '已添加荧光');
      }

      function getPrompts() { return prompts[state.task]; }

      function getQuestionSet(id) {
        return questionSets.find((item) => item.id === id) || null;
      }

      function resolvePromptImage(value) {
        const source = safeText(value);
        if (source.startsWith('bank:')) return getQuestionSet(source.slice(5))?.task1.image || '';
        return /^data:image\/(?:png|jpeg|webp);base64,/i.test(source) ? source : '';
      }

      function restorePromptImage(record, questionSetId) {
        if (record && Object.prototype.hasOwnProperty.call(record, 'promptImage')) return record.promptImage || '';
        return questionSetId ? `bank:${questionSetId}` : '';
      }

      function renderQuestionSetOptions() {
        els.questionSetSelect.replaceChildren(new Option('自定义', ''));
        questionSets.forEach((item) => els.questionSetSelect.add(new Option(item.id, item.id)));
      }

      function syncQuestionSetSelection() {
        els.questionSetSelect.value = getQuestionSet(state.questionSetId) ? state.questionSetId : '';
      }

      function formatTime(totalSeconds) {
        totalSeconds = normalizeSeconds(totalSeconds);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
      }

      function countWords(value) {
        const text = safeText(value).trim();
        if (!text) return 0;
        return (text.match(/[A-Za-z]+(?:\.[A-Za-z]+)+(?:\.)?|[A-Za-z0-9]+(?:[.,][0-9]+)*(?:['’\-][A-Za-z0-9]+)*/g) || []).length;
      }

      function snapshotHasWork(record) {
        if (!record || typeof record !== 'object') return false;
        const task = normalizeTask(record.task);
        const questionSet = getQuestionSet(record.questionSetId);
        const expectedTitle = questionSet?.id || '';
        const expectedQuestion = questionSet?.[task]?.text || '';
        const expectedImage = task === 'task1' && questionSet ? `bank:${questionSet.id}` : '';
        const question = safeText(record.promptText ?? record.questions?.[task]);
        const title = safeText(record.title ?? record.questionTitles?.[task]).trim();
        const image = task === 'task1'
          ? (Object.prototype.hasOwnProperty.call(record, 'promptImage') ? safeText(record.promptImage) : expectedImage)
          : '';
        return Boolean(
          safeText(record.content).trim()
          || normalizeHighlights(record.highlights, safeText(record.content).length).length
          || normalizeSeconds(record.elapsed)
          || question !== expectedQuestion
          || title !== expectedTitle
          || image !== expectedImage
        );
      }

      function hasCurrentWork() {
        return snapshotHasWork({
          ...state,
          title: els.titleInput.value,
          promptText: els.promptText.value,
          content: els.writingArea.value,
          elapsed: getElapsed()
        });
      }

      function updateStats() {
        const wordCount = countWords(state.content);
        const charCount = state.content.length;
        const paragraphs = state.content.trim() ? state.content.trim().split(/\n\s*\n/).filter(Boolean).length : 0;
        const target = state.task === 'task2' ? 250 : 150;
        els.wordCount.textContent = wordCount.toLocaleString('en-US');
        els.targetCount.textContent = target;
        els.targetHint.textContent = `至少 ${target} 词`;
        els.charCount.textContent = charCount.toLocaleString('en-US');
        els.paragraphCount.textContent = `${paragraphs} paragraph${paragraphs === 1 ? '' : 's'}`;
        els.progressBar.style.width = `${Math.min(100, Math.round((wordCount / target) * 100))}%`;
      }

      function renderSpellcheck() {
        els.writingArea.spellcheck = spellcheckEnabled;
        els.writingArea.setAttribute('spellcheck', String(spellcheckEnabled));
        els.spellcheckButton.textContent = `拼写：${spellcheckEnabled ? '开' : '关'}`;
        els.spellcheckButton.setAttribute('aria-pressed', String(spellcheckEnabled));
      }

      function toggleSpellcheck() {
        const selectionStart = els.writingArea.selectionStart;
        const selectionEnd = els.writingArea.selectionEnd;
        spellcheckEnabled = !spellcheckEnabled;
        writeLocal(SPELLCHECK_KEY, String(spellcheckEnabled), true);
        renderSpellcheck();
        els.writingArea.focus({ preventScroll: true });
        els.writingArea.setSelectionRange(selectionStart, selectionEnd);
        showToast(`拼写检查已${spellcheckEnabled ? '开启' : '关闭'}`);
      }

      function resizeQuestionArea() {
        els.promptText.style.height = 'auto';
        els.promptText.style.height = `${els.promptText.scrollHeight}px`;
      }

      function renderPrompt() {
        state.questions = { ...defaultQuestions, ...(state.questions || {}) };
        state.questionTitles = { ...defaultQuestionTitles, ...(state.questionTitles || {}) };
        state.title = state.questionTitles[state.task] || '';
        els.titleInput.value = state.title;
        els.promptText.value = state.questions[state.task] || '';
        syncQuestionSetSelection();
        renderTaskImage();
      }

      function renderTaskImage() {
        const isTask1 = state.task === 'task1';
        const imageSource = resolvePromptImage(state.promptImage);
        const hasImage = Boolean(imageSource);
        els.promptCard.classList.toggle('task1-mode', isTask1);
        els.taskImagePanel.hidden = !isTask1;
        els.imageEmpty.hidden = hasImage;
        els.promptImage.hidden = !hasImage;
        els.removeImageButton.hidden = !hasImage;
        els.replaceImageButton.textContent = hasImage ? '更换图片' : '选择图片';
        if (hasImage) els.promptImage.src = imageSource;
        else els.promptImage.removeAttribute('src');
        resizeQuestionArea();
      }

      function useImageFile(file) {
        if (transitionBusy) {
          showToast('请等待当前操作完成');
          return;
        }
        const requestVersion = ++imageRequestVersion;
        imageRequestPending = false;
        if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) {
          showToast('请选择 PNG、JPG 或 WebP 图片');
          return;
        }
        if (Number(file.size) > 25 * 1024 * 1024) {
          showToast('图片过大，请选择 25 MB 以内的图片');
          return;
        }
        imageRequestPending = true;
        const finishImageRequest = () => {
          if (requestVersion === imageRequestVersion) imageRequestPending = false;
        };
        const imageContext = {
          practiceId: state.practiceId,
          questionSetId: state.questionSetId,
          task: state.task
        };
        const reader = new FileReader();
        reader.onerror = () => {
          if (requestVersion === imageRequestVersion) {
            finishImageRequest();
            showToast('图片读取失败');
          }
        };
        reader.onload = () => {
          if (requestVersion !== imageRequestVersion) return;
          const source = String(reader.result || '');
          const image = new Image();
          image.onerror = () => {
            if (requestVersion === imageRequestVersion) {
              finishImageRequest();
              showToast('图片无法打开');
            }
          };
          image.onload = async () => {
            if (requestVersion !== imageRequestVersion) return;
            try {
              const maxSide = 1600;
              const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
              canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
              const context = canvas.getContext('2d');
              let output = source;
              if (context) {
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                const compressed = canvas.toDataURL('image/webp', 0.9);
                if (compressed.length < output.length || scale < 1) output = compressed;
              }
              if (
                requestVersion !== imageRequestVersion
                || state.practiceId !== imageContext.practiceId
                || state.questionSetId !== imageContext.questionSetId
                || state.task !== imageContext.task
              ) return;
              state.promptImage = output;
              renderTaskImage();
              const saveResult = saveCurrent(true);
              const savedToDatabase = await saveResult.databaseWrite;
              if (!saveResult.savedLocally && !savedToDatabase) {
                showToast('图片保存失败，请立即点击“备份”');
                return;
              }
              if (
                requestVersion === imageRequestVersion
                && state.practiceId === imageContext.practiceId
                && state.questionSetId === imageContext.questionSetId
                && state.task === imageContext.task
              ) showToast('题目图片已添加');
            } catch (error) {
              if (requestVersion === imageRequestVersion) showToast('图片处理失败，请重新选择');
            } finally {
              finishImageRequest();
            }
          };
          try {
            image.src = source;
          } catch (error) {
            finishImageRequest();
            showToast('图片无法打开');
          }
        };
        try {
          reader.readAsDataURL(file);
        } catch (error) {
          finishImageRequest();
          showToast('图片读取失败');
        }
      }

      function removePromptImage() {
        imageRequestVersion += 1;
        imageRequestPending = false;
        state.promptImage = '';
        els.promptImageInput.value = '';
        renderTaskImage();
        saveCurrent(true);
      }

      function beginStateTransition() {
        if (transitionBusy) return null;
        if (imageRequestPending) {
          showToast('图片正在保存，请稍后再切换');
          return null;
        }
        const context = {
          focusedElement: document.activeElement,
          practiceId: state.practiceId,
          wasRunning: state.isRunning
        };
        transitionBusy = true;
        imageRequestVersion += 1;
        setInterfaceReady(false);
        setTimerRunning(false);
        return context;
      }

      function finishStateTransition(context, completed) {
        transitionBusy = false;
        if (applicationReady) setInterfaceReady(true);
        if (!completed && state.practiceId === context.practiceId && context.wasRunning) setTimerRunning(true);
        if (!completed) {
          let focusTarget = context.focusedElement;
          if (!focusTarget?.isConnected || focusTarget.disabled) {
            focusTarget = !els.historyModal.hidden ? els.closeHistoryButton : els.writingArea;
          }
          focusTarget.focus({ preventScroll: true });
        }
      }

      async function setTask(task) {
        if (transitionBusy) return;
        task = normalizeTask(task);
        if (state.task === task) return;
        await persistenceReady;
        if (transitionBusy || state.task === task) return;
        state.questions[state.task] = els.promptText.value;
        state.questionTitles[state.task] = els.titleInput.value.trim();
        const hasWork = hasCurrentWork();
        if (hasWork && !window.confirm('切换 Task？当前内容会先保存到记录。')) return;
        const transition = beginStateTransition();
        if (!transition) return;
        let switched = false;
        try {
          if (hasWork && !(await archiveCurrent(false))) return;
          state = {
            ...state,
            task,
            title: state.questionTitles[task] || '',
            content: '',
            highlights: [],
            elapsed: 0,
            isRunning: false,
            startedAt: null,
            updatedAt: null,
            practiceId: createPracticeId()
          };
          els.writingArea.value = '';
          renderHighlights();
          renderTaskButtons();
          renderPrompt();
          updateTimerUI();
          updateStats();
          saveCurrent(true);
          switched = true;
        } finally {
          finishStateTransition(transition, switched);
        }
        if (switched) els.writingArea.focus();
      }

      async function selectQuestionSet(questionSetId) {
        if (transitionBusy) return;
        const selected = getQuestionSet(questionSetId);
        if (questionSetId && !selected) {
          syncQuestionSetSelection();
          return;
        }
        if (questionSetId === state.questionSetId) return;
        await persistenceReady;
        if (transitionBusy) return;
        const hasWork = hasCurrentWork();
        if (hasWork && !window.confirm('切换题目？当前内容会先保存到记录。')) {
          syncQuestionSetSelection();
          return;
        }
        const transition = beginStateTransition();
        if (!transition) {
          syncQuestionSetSelection();
          return;
        }
        let switched = false;
        let loadedId = '';
        try {
          if (hasWork && !(await archiveCurrent(false))) {
            syncQuestionSetSelection();
            return;
          }
          const task = state.task;
          const id = selected?.id || '';
          state = {
            task,
            promptIndex: selected ? questionSets.indexOf(selected) : 0,
            questionSetId: id,
            title: id,
            content: '',
            highlights: [],
            elapsed: 0,
            isRunning: false,
            startedAt: null,
            updatedAt: null,
            questions: selected ? { task1: selected.task1.text, task2: selected.task2.text } : { task1: '', task2: '' },
            questionTitles: { task1: id, task2: id },
            promptImage: selected ? `bank:${id}` : '',
            practiceId: createPracticeId()
          };
          els.writingArea.value = '';
          renderHighlights();
          renderTaskButtons();
          renderPrompt();
          updateTimerUI();
          updateStats();
          saveCurrent(true);
          loadedId = id;
          switched = true;
        } finally {
          finishStateTransition(transition, switched);
        }
        if (switched) {
          els.writingArea.focus();
          showToast(selected ? `${loadedId} 已载入` : '已切换到自定义题目');
        }
      }

      function getElapsed() {
        const savedElapsed = normalizeSeconds(state.elapsed);
        if (!state.isRunning || !state.startedAt) return savedElapsed;
        return savedElapsed + Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
      }

      function updateTimerUI() {
        const elapsed = getElapsed();
        els.timerValue.textContent = formatTime(elapsed);
        els.timerCard.classList.toggle('running', state.isRunning);
        els.timerToggle.textContent = state.isRunning ? 'Ⅱ 暂停' : (elapsed ? '▶ 继续' : '▶ 开始');
        els.timerState.textContent = state.isRunning ? '计时中' : (elapsed ? '已暂停' : '准备开始');
      }

      function setTimerRunning(running) {
        if (running === state.isRunning) return;
        if (running) {
          state.startedAt = Date.now();
          state.isRunning = true;
          timerHandle = window.setInterval(() => {
            updateTimerUI();
            if (getElapsed() % 5 === 0) scheduleSave();
          }, 1000);
          els.writingArea.focus();
        } else {
          state.elapsed = getElapsed();
          state.isRunning = false;
          state.startedAt = null;
          window.clearInterval(timerHandle);
          timerHandle = null;
        }
        updateTimerUI();
        scheduleSave();
      }

      function resetTimer() {
        setTimerRunning(false);
        state.elapsed = 0;
        state.startedAt = null;
        updateTimerUI();
        showToast('计时器已重置');
        scheduleSave();
      }

      function openDatabase() {
        if (databasePromise) return databasePromise;
        const pendingDatabase = new Promise((resolve, reject) => {
          if (!window.indexedDB) {
            reject(new Error('IndexedDB unavailable'));
            return;
          }
          const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
          request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains('history')) database.createObjectStore('history', { keyPath: 'id' });
            if (!database.objectStoreNames.contains('drafts')) database.createObjectStore('drafts', { keyPath: 'id' });
            if (!database.objectStoreNames.contains('revisions')) database.createObjectStore('revisions', { keyPath: 'id' });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('Database failed'));
        });
        databasePromise = pendingDatabase.catch((error) => {
          databasePromise = null;
          throw error;
        });
        return databasePromise;
      }

      async function databasePut(storeName, value) {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readwrite');
          transaction.objectStore(storeName).put(value);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => reject(transaction.error || new Error('Database write failed'));
          transaction.onabort = () => reject(transaction.error || new Error('Database write aborted'));
        });
      }

      async function databaseGet(storeName, key) {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
          const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error || new Error('Database read failed'));
        });
      }

      async function databaseGetAll(storeName) {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
          const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error || new Error('Database read failed'));
        });
      }

      async function databaseDelete(storeName, key) {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readwrite');
          transaction.objectStore(storeName).delete(key);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => reject(transaction.error || new Error('Database delete failed'));
          transaction.onabort = () => reject(transaction.error || new Error('Database delete aborted'));
        });
      }

      async function trimRevisions(limit = REVISION_LIMIT) {
        const revisions = await databaseGetAll('revisions');
        if (revisions.length <= limit) return;
        revisions.sort((a, b) => String(b.savedAt || b.updatedAt || '').localeCompare(String(a.savedAt || a.updatedAt || '')));
        await Promise.allSettled(revisions.slice(limit).map((item) => databaseDelete('revisions', item.id)));
      }

      function getRevisionSignature(snapshot) {
        return `${snapshot.practiceId}\n${snapshot.task}\n${snapshot.questionTitles.task1}\n${snapshot.questionTitles.task2}\n${snapshot.questions.task1}\n${snapshot.questions.task2}\n${snapshot.content}\n${JSON.stringify(normalizeHighlights(snapshot.highlights, safeText(snapshot.content).length))}`;
      }

      function scheduleRevisionFlush(delay) {
        window.clearTimeout(revisionTimer);
        revisionTimer = window.setTimeout(() => {
          revisionTimer = null;
          flushQueuedRevision();
        }, Math.max(0, delay));
      }

      function queueRevision(snapshot) {
        const signature = getRevisionSignature(snapshot);
        if (!snapshotHasWork(snapshot)) {
          if (queuedRevision?.snapshot.practiceId === snapshot.practiceId) queuedRevision = null;
          return;
        }
        if (signature === pendingRevisionSignature) {
          queuedRevision = null;
          return;
        }
        if (!pendingRevisionSignature && signature === lastRevisionSignature) {
          queuedRevision = null;
          window.clearTimeout(revisionTimer);
          revisionTimer = null;
          return;
        }
        const revisionSnapshot = {
          ...snapshot,
          questions: { ...snapshot.questions },
          questionTitles: { ...snapshot.questionTitles },
          highlights: normalizeHighlights(snapshot.highlights, safeText(snapshot.content).length)
        };
        delete revisionSnapshot.promptImage;
        queuedRevision = {
          signature,
          snapshot: revisionSnapshot,
          retries: queuedRevision?.signature === signature ? queuedRevision.retries : 0
        };
        flushQueuedRevision();
      }

      function flushQueuedRevision() {
        if (!queuedRevision || pendingRevisionSignature) return;
        const revision = queuedRevision;
        const now = Date.now();
        const practiceChanged = revision.snapshot.practiceId !== lastRevisionPracticeId;
        const delay = practiceChanged ? 0 : Math.max(0, REVISION_INTERVAL_MS - (now - lastRevisionSavedAt));
        if (delay > 0) {
          scheduleRevisionFlush(delay);
          return;
        }
        window.clearTimeout(revisionTimer);
        revisionTimer = null;
        queuedRevision = null;
        pendingRevisionSignature = revision.signature;
        databasePut('revisions', {
          ...revision.snapshot,
          id: `${now}-${Math.random().toString(16).slice(2)}`,
          savedAt: revision.snapshot.updatedAt || new Date(now).toISOString()
        }).then(() => {
          if (pendingRevisionSignature !== revision.signature) return;
          pendingRevisionSignature = '';
          lastRevisionSignature = revision.signature;
          lastRevisionSavedAt = now;
          lastRevisionPracticeId = revision.snapshot.practiceId;
          revisionWriteCount += 1;
          if (revisionWriteCount % 12 === 0) trimRevisions().catch(() => {});
          if (queuedRevision?.signature === lastRevisionSignature) queuedRevision = null;
          flushQueuedRevision();
        }).catch(() => {
          if (pendingRevisionSignature === revision.signature) pendingRevisionSignature = '';
          if (!queuedRevision && revision.retries < 2) {
            queuedRevision = { ...revision, retries: revision.retries + 1 };
          }
          if (queuedRevision) scheduleRevisionFlush(5000);
        });
      }

      function readLocal(key) {
        try { return localStorage.getItem(key); } catch (error) { return null; }
      }

      function writeLocal(key, value, quiet = false) {
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (error) {
          if (!quiet) {
            showToast('保存失败，请立即点击“备份”');
          }
          return false;
        }
      }

      function readHistoryTombstones() {
        try {
          const value = JSON.parse(readLocal(DELETED_HISTORY_KEY) || '{}');
          return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch (error) { return {}; }
      }

      function writeHistoryTombstones(value) {
        return writeLocal(DELETED_HISTORY_KEY, JSON.stringify(value), true);
      }

      function clearHistoryTombstone(id) {
        const tombstones = readHistoryTombstones();
        if (!Object.prototype.hasOwnProperty.call(tombstones, id)) return;
        delete tombstones[id];
        writeHistoryTombstones(tombstones);
      }

      function saveEmergencyDraft() {
        state.content = els.writingArea.value;
        state.questions[state.task] = els.promptText.value;
        state.title = els.titleInput.value.trim();
        state.questionTitles[state.task] = state.title;
        const emergency = {
          task: state.task,
          promptIndex: state.promptIndex,
          questionSetId: state.questionSetId,
          title: state.title,
          content: state.content,
          highlights: normalizeHighlights(state.highlights, state.content.length),
          questions: state.questions,
          questionTitles: state.questionTitles,
          practiceId: state.practiceId,
          elapsed: getElapsed(),
          isRunning: false,
          startedAt: null,
          updatedAt: new Date().toISOString()
        };
        writeLocal(EMERGENCY_KEY, JSON.stringify(emergency), true);
        return emergency;
      }

      function saveCurrent(silent = false) {
        state.title = els.titleInput.value.trim();
        state.content = els.writingArea.value;
        state.highlights = normalizeHighlights(state.highlights, state.content.length);
        state.questions[state.task] = els.promptText.value;
        state.questionTitles[state.task] = state.title;
        state.updatedAt = new Date().toISOString();
        const snapshot = {
          ...state,
          elapsed: getElapsed(),
          isRunning: false,
          startedAt: null
        };
        const savedLocally = writeLocal(STORAGE_KEY, JSON.stringify(snapshot), true);
        writeLocal(EMERGENCY_KEY, JSON.stringify({ ...snapshot, promptImage: '' }), true);
        const databaseWrite = databasePut('drafts', { id: 'current', ...snapshot })
          .then(() => true)
          .catch(() => {
            if (!savedLocally) {
              showToast('保存失败，请立即点击“备份”');
            }
            return false;
          });
        queueRevision(snapshot);
        updateHistorySummary();
        if (!silent) showToast('练习已保存到本地');
        return { savedLocally, databaseWrite, snapshot };
      }

      function scheduleSave() {
        window.clearTimeout(saveHandle);
        saveHandle = window.setTimeout(() => saveCurrent(true), 450);
      }

      function createHistorySnapshot() {
        if (!hasCurrentWork()) return null;
        state.title = els.titleInput.value.trim();
        state.content = els.writingArea.value;
        state.questionTitles[state.task] = state.title;
        const wordCount = countWords(state.content);
        if (!state.practiceId) state.practiceId = createPracticeId();
        const fallbackTitle = state.questionSetId || getPrompts()[state.promptIndex]?.title || (state.task === 'task1' ? 'Task 1' : 'Task 2');
        const snapshot = {
          id: state.practiceId,
          questionSetId: state.questionSetId || '',
          title: state.title,
          task: state.task,
          promptTitle: state.title || fallbackTitle,
          promptText: els.promptText.value,
          promptImage: state.promptImage,
          questions: { ...state.questions, [state.task]: els.promptText.value },
          questionTitles: { ...state.questionTitles, [state.task]: state.title },
          content: state.content,
          highlights: normalizeHighlights(state.highlights, state.content.length),
          wordCount,
          elapsed: getElapsed(),
          updatedAt: new Date().toISOString()
        };
        return snapshotHasWork(snapshot) ? snapshot : null;
      }

      function writeHistoryMirror() {
        const canCompact = historyDatabaseAvailable && unsyncedHistoryIds.size === 0;
        const compact = historyCache.map((item) => ({
          ...item,
          promptImage: String(item.promptImage || '').startsWith('bank:') ? item.promptImage : ''
        }));
        const records = canCompact ? compact : historyCache;
        if (writeLocal(HISTORY_KEY, JSON.stringify(records), true)) return true;
        if (!canCompact) return false;
        return writeLocal(HISTORY_KEY, JSON.stringify(compact.slice(0, 100)), true);
      }

      async function syncUnsyncedHistoryRecords() {
        const historyById = new Map(historyCache.map((item) => [item.id, item]));
        [...unsyncedHistoryIds].forEach((id) => {
          if (!historyById.has(id)) unsyncedHistoryIds.delete(id);
        });
        const pending = [...unsyncedHistoryIds].map((id) => historyById.get(id)).filter(Boolean);
        if (!pending.length) {
          historyDatabaseAvailable = true;
          return true;
        }
        const results = await Promise.allSettled(pending.map((item) => databasePut('history', item)));
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') unsyncedHistoryIds.delete(pending[index].id);
        });
        historyDatabaseAvailable = unsyncedHistoryIds.size === 0;
        return historyDatabaseAvailable;
      }

      async function archiveCurrent(showConfirmation = false) {
        await persistenceReady;
        const snapshot = createHistorySnapshot();
        if (!snapshot) return false;
        const nextHistory = [snapshot, ...historyCache.filter((item) => item.id !== snapshot.id)];
        let databaseSaved = false;
        try {
          await databasePut('history', snapshot);
          databaseSaved = true;
        } catch (error) { /* The local mirror remains as a fallback. */ }
        historyCache = nextHistory;
        if (databaseSaved) {
          unsyncedHistoryIds.delete(snapshot.id);
          if (unsyncedHistoryIds.size) await syncUnsyncedHistoryRecords();
          else historyDatabaseAvailable = true;
        } else {
          unsyncedHistoryIds.add(snapshot.id);
          historyDatabaseAvailable = false;
        }
        const mirrorSaved = writeHistoryMirror();
        if (!databaseSaved && !mirrorSaved) {
          showToast('保存失败，请立即点击“备份”');
          return false;
        }
        clearHistoryTombstone(snapshot.id);
        saveCurrent(true);
        renderHistory();
        updateHistorySummary();
        if (showConfirmation) showToast('已保存到练习记录');
        return true;
      }

      async function addToHistory() {
        if (!hasCurrentWork()) {
          showToast('先写一些内容');
          els.writingArea.focus();
          return;
        }
        await archiveCurrent(true);
      }

      function readHistory() {
        return historyCache;
      }

      function applySavedDraft(saved) {
        if (!saved || typeof saved !== 'object') return false;
        const task = normalizeTask(saved.task);
        const questionSetId = getQuestionSet(safeText(saved.questionSetId)) ? safeText(saved.questionSetId) : '';
        const questionSet = getQuestionSet(questionSetId);
        const fallbackQuestions = questionSet
          ? { task1: questionSet.task1.text, task2: questionSet.task2.text }
          : defaultQuestions;
        const fallbackTitle = questionSet?.id || '';
        const savedQuestions = saved.questions && typeof saved.questions === 'object' ? saved.questions : {};
        const savedTitles = saved.questionTitles && typeof saved.questionTitles === 'object' ? saved.questionTitles : {};
        const questions = {
          task1: Object.prototype.hasOwnProperty.call(savedQuestions, 'task1') ? safeText(savedQuestions.task1) : fallbackQuestions.task1,
          task2: Object.prototype.hasOwnProperty.call(savedQuestions, 'task2') ? safeText(savedQuestions.task2) : fallbackQuestions.task2
        };
        const restoredTitles = {
          task1: Object.prototype.hasOwnProperty.call(savedTitles, 'task1') ? safeText(savedTitles.task1) : fallbackTitle,
          task2: Object.prototype.hasOwnProperty.call(savedTitles, 'task2') ? safeText(savedTitles.task2) : fallbackTitle
        };
        if (!restoredTitles[task] && saved.title) restoredTitles[task] = safeText(saved.title);
        state = {
          task,
          promptIndex: questionSet ? questionSets.indexOf(questionSet) : (Number.isInteger(saved.promptIndex) ? Math.max(0, saved.promptIndex) : 0),
          questionSetId,
          title: safeText(saved.title || restoredTitles[task]),
          content: safeText(saved.content),
          highlights: normalizeHighlights(saved.highlights, safeText(saved.content).length),
          elapsed: normalizeSeconds(saved.elapsed),
          isRunning: false,
          startedAt: null,
          updatedAt: safeText(saved.updatedAt) || null,
          questions,
          questionTitles: restoredTitles,
          promptImage: restorePromptImage(saved, questionSetId),
          practiceId: safeText(saved.practiceId) || createPracticeId()
        };
        els.writingArea.value = state.content;
        renderHighlights();
        lastRevisionSignature = getRevisionSignature(state);
        lastRevisionPracticeId = state.practiceId;
        lastRevisionSavedAt = Date.parse(state.updatedAt || '') || 0;
        pendingRevisionSignature = '';
        queuedRevision = null;
        window.clearTimeout(revisionTimer);
        revisionTimer = null;
        updateTimerUI();
        renderTaskButtons();
        renderPrompt();
        updateStats();
        return true;
      }

      async function restoreCurrent() {
        let localDraft = null;
        let databaseDraft = null;
        let emergencyDraft = null;
        try { localDraft = JSON.parse(readLocal(STORAGE_KEY) || 'null'); } catch (error) { /* Use the database copy. */ }
        try { emergencyDraft = JSON.parse(readLocal(EMERGENCY_KEY) || 'null'); } catch (error) { /* Use a full saved copy. */ }
        try { databaseDraft = await databaseGet('drafts', 'current'); } catch (error) { /* Use the local copy. */ }
        try {
          const latestEmergency = JSON.parse(readLocal(EMERGENCY_KEY) || 'null');
          if (String(latestEmergency?.updatedAt || '') > String(emergencyDraft?.updatedAt || '')) emergencyDraft = latestEmergency;
        } catch (error) { /* Keep the earlier emergency copy. */ }
        const fullDraft = [localDraft, databaseDraft]
          .filter(Boolean)
          .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
        const saved = emergencyDraft && String(emergencyDraft.updatedAt || '') > String(fullDraft?.updatedAt || '')
          ? { ...(fullDraft || {}), ...emergencyDraft, promptImage: fullDraft?.promptImage || '' }
          : fullDraft;
        if (!saved) return false;
        applySavedDraft(saved);
        return true;
      }

      function renderTaskButtons() {
        document.querySelectorAll('.task-tab').forEach((tab) => {
          const active = tab.dataset.task === state.task;
          tab.classList.toggle('active', active);
          tab.setAttribute('aria-pressed', String(active));
        });
      }

      async function startNewPractice() {
        if (transitionBusy) return;
        await persistenceReady;
        if (transitionBusy) return;
        const hasWork = hasCurrentWork();
        if (hasWork && !window.confirm('开始新练习？当前内容会先保存到记录。')) return;
        const transition = beginStateTransition();
        if (!transition) return;
        let started = false;
        try {
          if (hasWork && !(await archiveCurrent(false))) return;
          state.questions[state.task] = els.promptText.value;
          state.questionTitles[state.task] = els.titleInput.value.trim();
          const task = state.task;
          const title = state.questionTitles[task] || '';
          state = {
            task,
            promptIndex: state.promptIndex,
            questionSetId: state.questionSetId || '',
            title,
            content: '',
            highlights: [],
            elapsed: 0,
            isRunning: false,
            startedAt: null,
            updatedAt: null,
            questions: { ...state.questions },
            questionTitles: { ...state.questionTitles },
            promptImage: state.promptImage,
            practiceId: createPracticeId()
          };
          els.writingArea.value = '';
          renderHighlights();
          renderTaskButtons();
          renderPrompt();
          updateTimerUI();
          updateStats();
          saveCurrent(true);
          started = true;
        } finally {
          finishStateTransition(transition, started);
        }
        if (started) {
          els.writingArea.focus();
          showToast(`已准备新的${state.questionSetId ? ` ${state.questionSetId}` : ''}练习`);
        }
      }

      function formatDate(dateString) {
        if (!dateString) return '刚刚';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return '时间未知';
        return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      }

      function preparePrint() {
        saveCurrent(true);
        const title = els.titleInput.value.trim() || (state.task === 'task1' ? 'Task 1 Practice' : 'Task 2 Practice');
        const words = countWords(els.writingArea.value);
        const imageSource = resolvePromptImage(state.promptImage);
        const hasImage = state.task === 'task1' && Boolean(imageSource);
        const denseLimit = state.task === 'task1' ? 220 : 360;
        const ultraLimit = state.task === 'task1' ? 320 : 520;
        const density = words > ultraLimit ? 'ultra' : (words > denseLimit ? 'dense' : 'normal');
        els.printSheet.dataset.task = state.task;
        els.printSheet.dataset.hasImage = String(hasImage);
        els.printSheet.dataset.density = density;
        els.printTask.textContent = `IELTS Writing ${state.task === 'task1' ? 'Task 1' : 'Task 2'}`;
        els.printTitle.textContent = title;
        els.printMeta.textContent = `${words} words · ${formatTime(getElapsed())} · ${formatDate(new Date().toISOString())}`;
        els.printQuestion.textContent = els.promptText.value.trim().replace(/\n[\t ]*\n+/g, '\n');
        appendHighlightedText(els.printAnswer, els.writingArea.value, state.highlights);
        els.printQuestionImage.hidden = !hasImage;
        if (hasImage) els.printQuestionImage.src = imageSource;
        else els.printQuestionImage.removeAttribute('src');
      }

      async function printCurrentPractice() {
        preparePrint();
        if (!els.printQuestionImage.hidden && typeof els.printQuestionImage.decode === 'function') {
          try { await els.printQuestionImage.decode(); } catch (error) { /* Print the text even if the image cannot decode. */ }
        }
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        window.print();
      }

      function renderHistory() {
        const history = readHistory();
        if (!history.length) {
          els.historyList.innerHTML = '<div class="empty-history">还没有练习记录。完成一次练习后，点击“保存练习”即可在这里找到它。</div>';
          return;
        }
        els.historyList.innerHTML = history.map((item) => {
          const itemId = escapeHtml(safeText(item.id));
          return `
            <div class="history-item">
              <div class="history-item-info">
                <p class="history-item-title">${escapeHtml(item.title || (item.task === 'task1' ? 'Task 1' : 'Task 2'))}</p>
                <div class="history-item-meta">${item.task === 'task2' ? 'Task 2' : 'Task 1'} · ${countWords(item.content)} 词 · ${formatTime(item.elapsed)} · ${formatDate(item.updatedAt)}</div>
              </div>
              <div class="history-item-actions">
                <button class="button button-primary button-small" type="button" data-repeat="${itemId}">再次练习</button>
                <button class="button button-ghost button-small" type="button" data-restore="${itemId}">恢复</button>
                <button class="button button-ghost button-small" type="button" data-delete="${itemId}" aria-label="删除这条记录">删除</button>
              </div>
            </div>
          `;
        }).join('');
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
      }

      function renderHighlightedHtml(value, ranges) {
        const text = safeText(value);
        const normalized = normalizeHighlights(ranges, text.length);
        let cursor = 0;
        let html = '';
        normalized.forEach((range) => {
          html += escapeHtml(text.slice(cursor, range.start));
          html += `<mark>${escapeHtml(text.slice(range.start, range.end))}</mark>`;
          cursor = range.end;
        });
        return html + escapeHtml(text.slice(cursor));
      }

      function updateHistorySummary() {
        const history = readHistory();
        $('historyButton').textContent = history.length ? `记录 ${history.length}` : '记录';
      }

      async function restoreHistoryItem(id) {
        if (transitionBusy) return;
        await persistenceReady;
        if (transitionBusy) return;
        let item = readHistory().find((entry) => entry.id === id);
        if (!item) return;
        const hasWork = hasCurrentWork();
        const transition = beginStateTransition();
        if (!transition) return;
        let restored = false;
        try {
          if (hasWork && !(await archiveCurrent(false))) return;
          item = readHistory().find((entry) => entry.id === id) || item;
          const questionSetId = getQuestionSet(item.questionSetId) ? item.questionSetId : '';
          const questionSet = getQuestionSet(questionSetId);
          const restoredTitle = Object.prototype.hasOwnProperty.call(item.questionTitles || {}, item.task)
            ? safeText(item.questionTitles[item.task])
            : safeText(item.title || questionSetId);
          state = {
            task: item.task,
            promptIndex: questionSet ? questionSets.indexOf(questionSet) : Math.max(0, getPromptsForTask(item.task).findIndex((prompt) => prompt.title === item.promptTitle)),
            questionSetId,
            title: restoredTitle,
            content: item.content,
            highlights: normalizeHighlights(item.highlights, safeText(item.content).length),
            elapsed: item.elapsed || 0,
            isRunning: false,
            startedAt: null,
            updatedAt: item.updatedAt,
            questions: {
              ...defaultQuestions,
              ...(questionSet ? { task1: questionSet.task1.text, task2: questionSet.task2.text } : {}),
              ...(item.questions || {}),
              [item.task]: item.promptText || item.questions?.[item.task] || defaultQuestions[item.task]
            },
            questionTitles: { ...defaultQuestionTitles, ...(item.questionTitles || {}), [item.task]: restoredTitle },
            promptImage: restorePromptImage(item, questionSetId),
            practiceId: item.id
          };
          els.writingArea.value = state.content;
          renderHighlights();
          renderTaskButtons();
          renderPrompt();
          updateTimerUI();
          updateStats();
          closeHistory();
          saveCurrent(true);
          restored = true;
        } finally {
          finishStateTransition(transition, restored);
        }
        if (restored) {
          els.writingArea.focus();
          showToast('已恢复这份练习');
        }
      }

      async function repeatHistoryItem(id) {
        if (transitionBusy) return;
        await persistenceReady;
        if (transitionBusy) return;
        let item = readHistory().find((entry) => entry.id === id);
        if (!item) return;
        const hasWork = hasCurrentWork();
        const transition = beginStateTransition();
        if (!transition) return;
        let repeated = false;
        try {
          if (hasWork && !(await archiveCurrent(false))) return;
          item = readHistory().find((entry) => entry.id === id) || item;
          const questionSetId = getQuestionSet(item.questionSetId) ? item.questionSetId : '';
          const questionSet = getQuestionSet(questionSetId);
          const restoredTitle = Object.prototype.hasOwnProperty.call(item.questionTitles || {}, item.task)
            ? safeText(item.questionTitles[item.task])
            : safeText(item.title || questionSetId);
          state = {
            task: item.task,
            promptIndex: questionSet ? questionSets.indexOf(questionSet) : Math.max(0, getPromptsForTask(item.task).findIndex((prompt) => prompt.title === item.promptTitle)),
            questionSetId,
            title: restoredTitle,
            content: '',
            highlights: [],
            elapsed: 0,
            isRunning: false,
            startedAt: null,
            updatedAt: null,
            questions: {
              ...defaultQuestions,
              ...(questionSet ? { task1: questionSet.task1.text, task2: questionSet.task2.text } : {}),
              ...(item.questions || {}),
              [item.task]: item.promptText || item.questions?.[item.task] || defaultQuestions[item.task]
            },
            questionTitles: { ...defaultQuestionTitles, ...(item.questionTitles || {}), [item.task]: restoredTitle },
            promptImage: restorePromptImage(item, questionSetId),
            practiceId: createPracticeId()
          };
          els.writingArea.value = '';
          renderHighlights();
          renderTaskButtons();
          renderPrompt();
          updateTimerUI();
          updateStats();
          closeHistory();
          saveCurrent(true);
          repeated = true;
        } finally {
          finishStateTransition(transition, repeated);
        }
        if (repeated) {
          els.writingArea.focus();
          showToast('已开始同一题目的新练习');
        }
      }

      function getPromptsForTask(task) { return prompts[task] || prompts.task2; }

      async function deleteHistoryItem(id) {
        await persistenceReady;
        const previousHistory = [...historyCache];
        const previousUnsyncedHistoryIds = new Set(unsyncedHistoryIds);
        const previousHistoryDatabaseAvailable = historyDatabaseAvailable;
        const tombstones = readHistoryTombstones();
        tombstones[id] = new Date().toISOString();
        const tombstoneSaved = writeHistoryTombstones(tombstones);
        historyCache = readHistory().filter((item) => item.id !== id);
        unsyncedHistoryIds.delete(id);
        let databaseUpdated = false;
        try {
          await databaseDelete('history', id);
          databaseUpdated = true;
        } catch (error) { /* Keep going with the full local copy. */ }
        if (databaseUpdated) {
          if (unsyncedHistoryIds.size) await syncUnsyncedHistoryRecords();
          else historyDatabaseAvailable = true;
        }
        const mirrorSaved = writeHistoryMirror();
        const deletionDurable = tombstoneSaved || (databaseUpdated && mirrorSaved);
        if (!deletionDurable) {
          historyCache = previousHistory;
          unsyncedHistoryIds = previousUnsyncedHistoryIds;
          historyDatabaseAvailable = previousHistoryDatabaseAvailable;
          const originalItem = previousHistory.find((item) => item.id === id);
          if (databaseUpdated && originalItem) {
            try { await databasePut('history', originalItem); } catch (error) { /* The previous local mirror still protects the record. */ }
          }
          writeHistoryMirror();
          showToast('删除失败，请先备份后重试');
          return;
        }
        if (state.practiceId === id) {
          state.practiceId = createPracticeId();
          saveCurrent(true);
        }
        renderHistory();
        updateHistorySummary();
        showToast('已删除这条记录');
      }

      function readLegacyHistory() {
        try {
          const value = JSON.parse(readLocal(HISTORY_KEY) || '[]');
          return Array.isArray(value) ? value.map(normalizeHistoryItem).filter(Boolean) : [];
        } catch (error) { return []; }
      }

      function normalizeHistoryItem(item) {
        if (!item || typeof item !== 'object' || !safeText(item.id)) return null;
        const task = normalizeTask(item.task);
        const questionSetId = safeText(item.questionSetId);
        const questions = item.questions && typeof item.questions === 'object' ? item.questions : {};
        const questionTitles = item.questionTitles && typeof item.questionTitles === 'object' ? item.questionTitles : {};
        const normalizedQuestions = {};
        const normalizedTitles = {};
        if (Object.prototype.hasOwnProperty.call(questions, 'task1')) normalizedQuestions.task1 = safeText(questions.task1);
        if (Object.prototype.hasOwnProperty.call(questions, 'task2')) normalizedQuestions.task2 = safeText(questions.task2);
        if (Object.prototype.hasOwnProperty.call(questionTitles, 'task1')) normalizedTitles.task1 = safeText(questionTitles.task1);
        if (Object.prototype.hasOwnProperty.call(questionTitles, 'task2')) normalizedTitles.task2 = safeText(questionTitles.task2);
        const content = safeText(item.content);
        const normalized = {
          ...item,
          id: safeText(item.id),
          task,
          questionSetId,
          title: safeText(item.title),
          promptTitle: safeText(item.promptTitle),
          promptText: safeText(item.promptText),
          questions: normalizedQuestions,
          questionTitles: normalizedTitles,
          content,
          highlights: normalizeHighlights(item.highlights, content.length),
          wordCount: countWords(content),
          elapsed: normalizeSeconds(item.elapsed),
          updatedAt: safeText(item.updatedAt || item.savedAt)
        };
        if (Object.prototype.hasOwnProperty.call(item, 'promptImage')) normalized.promptImage = safeText(item.promptImage);
        else if (task === 'task1' && getQuestionSet(questionSetId)) normalized.promptImage = `bank:${questionSetId}`;
        return normalized;
      }

      function historyTimestamp(item) {
        const timestamp = Date.parse(item?.updatedAt || item?.savedAt || '');
        return Number.isFinite(timestamp) ? timestamp : 0;
      }

      async function initializeHistory() {
        const localHistory = readLegacyHistory();
        let databaseHistory = [];
        let databaseAvailable = false;
        try {
          databaseHistory = (await databaseGetAll('history')).map(normalizeHistoryItem).filter(Boolean);
          databaseAvailable = true;
        } catch (error) { /* Use the local copy without compacting it. */ }
        historyDatabaseAvailable = false;
        unsyncedHistoryIds = new Set();
        const tombstones = readHistoryTombstones();
        const isDeleted = (item) => Object.prototype.hasOwnProperty.call(tombstones, item.id);
        const merged = new Map();
        [...localHistory, ...databaseHistory].filter((item) => !isDeleted(item)).forEach((item) => {
          const current = merged.get(item.id);
          if (!current || historyTimestamp(item) >= historyTimestamp(current)) merged.set(item.id, item);
        });
        historyCache = Array.from(merged.values()).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        if (databaseAvailable) {
          const databaseById = new Map(databaseHistory.map((item) => [item.id, item]));
          const migrations = historyCache.filter((item) => {
            const databaseItem = databaseById.get(item.id);
            return !databaseItem || historyTimestamp(item) > historyTimestamp(databaseItem);
          });
          const migrationResults = await Promise.allSettled(migrations.map((item) => databasePut('history', item)));
          migrationResults.forEach((result, index) => {
            if (result.status === 'rejected') unsyncedHistoryIds.add(migrations[index].id);
          });
          await Promise.allSettled(Object.keys(tombstones).map((id) => databaseDelete('history', id)));
          historyDatabaseAvailable = unsyncedHistoryIds.size === 0;
          writeHistoryMirror();
          if (!historyDatabaseAvailable) showToast('部分记录仅保存在本地，请先点击“备份”');
        } else {
          unsyncedHistoryIds = new Set(historyCache.map((item) => item.id));
        }
      }

      function renderBackupEntry(item, label, index, renderedImages) {
        const question = item.promptText || item.questions?.[item.task] || '';
        const words = countWords(item.content);
        const imageSource = item.task === 'task1' ? resolvePromptImage(item.promptImage) : '';
        const imageKey = safeText(item.promptImage) || imageSource;
        const includeImage = Boolean(imageSource) && !renderedImages.has(imageKey);
        if (includeImage) renderedImages.add(imageKey);
        const image = includeImage ? `<img src="${escapeHtml(imageSource)}" alt="Task 1 question image" />` : '';
        return `<article>
          <header><strong>${escapeHtml(label)} ${index}</strong><span>${escapeHtml(formatDate(item.updatedAt || item.savedAt))} · ${words} words · ${formatTime(item.elapsed || 0)}</span></header>
          <h2>${escapeHtml(item.title || (item.task === 'task1' ? 'Task 1' : 'Task 2'))}</h2>
          <pre class="question">${escapeHtml(question)}</pre>
          ${image}
          <pre class="essay">${renderHighlightedHtml(item.content || '', item.highlights)}</pre>
        </article>`;
      }

      async function exportBackup() {
        await persistenceReady;
        saveCurrent(true);
        const current = {
          ...state,
          promptText: els.promptText.value,
          content: els.writingArea.value,
          highlights: normalizeHighlights(state.highlights, els.writingArea.value.length),
          wordCount: countWords(els.writingArea.value),
          elapsed: getElapsed(),
          updatedAt: new Date().toISOString()
        };
        let revisions = [];
        let revisionsAvailable = true;
        try { revisions = await databaseGetAll('revisions'); } catch (error) { revisionsAvailable = false; }
        const seen = new Set([current, ...historyCache].map((item) => `${item.task}\n${item.promptText || item.questions?.[item.task] || ''}\n${item.content || ''}\n${JSON.stringify(normalizeHighlights(item.highlights, safeText(item.content).length))}`));
        const uniqueRevisions = revisions
          .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
          .filter((item) => {
            if (!snapshotHasWork(item)) return false;
            const key = `${item.task}\n${item.questions?.[item.task] || ''}\n${item.content || ''}\n${JSON.stringify(normalizeHighlights(item.highlights, safeText(item.content).length))}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        const entries = [];
        const renderedImages = new Set();
        if (snapshotHasWork(current)) entries.push(renderBackupEntry(current, 'Current draft', 1, renderedImages));
        historyCache.forEach((item, index) => entries.push(renderBackupEntry(item, 'Saved practice', index + 1, renderedImages)));
        uniqueRevisions.forEach((item, index) => entries.push(renderBackupEntry(item, 'Draft version', index + 1, renderedImages)));
        const imageAssets = {};
        const imageAssetIds = new Map();
        const packBackupRecord = (item) => {
          const packed = {
            ...item,
            highlights: normalizeHighlights(item.highlights, safeText(item.content).length)
          };
          const source = safeText(packed.promptImage);
          if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(source)) {
            let assetId = imageAssetIds.get(source);
            if (!assetId) {
              assetId = `image-${imageAssetIds.size + 1}`;
              imageAssetIds.set(source, assetId);
              imageAssets[assetId] = source;
            }
            packed.promptImage = `asset:${assetId}`;
          }
          return packed;
        };
        const backupData = {
          format: 'ielts-writing-practice-backup',
          version: 2,
          exportedAt: new Date().toISOString(),
          imageAssets,
          current: packBackupRecord(current),
          history: historyCache.map(packBackupRecord),
          revisions: uniqueRevisions.map(packBackupRecord)
        };
        const machineData = JSON.stringify(backupData).replace(/</g, '\\u003c');
        const backup = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>IELTS Writing Backup</title><style>body{max-width:920px;margin:40px auto;padding:0 24px;color:#1f2937;font:15px/1.65 system-ui,sans-serif}h1{font-size:24px}article{padding:24px 0;border-top:1px solid #d1d5db}article header{display:flex;justify-content:space-between;gap:20px;color:#6b7280}article header strong{color:#111827}.question,.essay{white-space:pre-wrap;font:15px/1.7 Georgia,serif}.question{padding:16px;background:#f3f4f6}.essay{font-size:17px}.essay mark{color:inherit;background:#fff0a3}img{display:block;max-width:100%;max-height:720px;margin:16px 0;object-fit:contain}</style></head><body><h1>IELTS Writing Backup</h1><p>Exported ${escapeHtml(new Date().toLocaleString())}</p>${entries.join('')}<script type="application/json" id="ielts-writing-backup-data">${machineData}<\/script></body></html>`;
        const blob = new Blob([backup], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ielts-writing-backup-${new Date().toISOString().slice(0, 10)}.html`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(revisionsAvailable && historyDatabaseAvailable ? '完整备份已下载' : '备份已下载（包含当前可读取的记录）');
      }

      async function initializeApplication() {
        try {
          renderQuestionSetOptions();
          renderSpellcheck();
          const [restored] = await Promise.all([restoreCurrent(), initializeHistory()]);
          if (!restored) {
            renderTaskButtons();
            renderPrompt();
            renderHighlights();
            updateStats();
            saveCurrent(true);
          } else saveCurrent(true);
          updateHistorySummary();
          trimRevisions().catch(() => {});
          if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
        } finally {
          applicationReady = true;
          setInterfaceReady(true);
        }
      }

      function setInterfaceReady(ready) {
        els.appShell.setAttribute('aria-busy', String(!ready));
        els.imageDropzone.setAttribute('aria-disabled', String(!ready));
        els.imageDropzone.tabIndex = ready ? 0 : -1;
        document.querySelectorAll('.app-shell button, .app-shell input, .app-shell select, .app-shell textarea, #historyModal button').forEach((control) => {
          control.disabled = !ready;
        });
      }

      async function openHistory() {
        await persistenceReady;
        renderHistory();
        focusBeforeHistory = document.activeElement;
        els.historyModal.hidden = false;
        els.appShell.inert = true;
        document.body.style.overflow = 'hidden';
        els.closeHistoryButton.focus();
      }

      function closeHistory() {
        if (els.historyModal.hidden) return;
        els.historyModal.hidden = true;
        els.appShell.inert = false;
        document.body.style.overflow = '';
        if (focusBeforeHistory && typeof focusBeforeHistory.focus === 'function') focusBeforeHistory.focus();
        focusBeforeHistory = null;
      }

      function persistNow() {
        if (!applicationReady) return;
        window.clearTimeout(saveHandle);
        saveHandle = null;
        saveCurrent(true);
      }

      function showToast(message) {
        els.toast.textContent = message;
        els.toast.classList.add('show');
        window.clearTimeout(toastHandle);
        toastHandle = window.setTimeout(() => els.toast.classList.remove('show'), 2300);
      }

      setInterfaceReady(false);

      document.querySelectorAll('.task-tab').forEach((tab) => tab.addEventListener('click', () => setTask(tab.dataset.task)));
      els.questionSetSelect.addEventListener('change', () => selectQuestionSet(els.questionSetSelect.value));
      els.promptText.addEventListener('input', () => {
        state.questions[state.task] = els.promptText.value;
        resizeQuestionArea();
        saveEmergencyDraft();
        scheduleSave();
      });
      els.imageDropzone.addEventListener('paste', (event) => {
        const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'));
        if (!imageItem) {
          showToast('剪贴板里没有图片');
          return;
        }
        event.preventDefault();
        useImageFile(imageItem.getAsFile());
      });
      ['dragenter', 'dragover'].forEach((type) => els.imageDropzone.addEventListener(type, (event) => {
        event.preventDefault();
        els.imageDropzone.classList.add('dragging');
      }));
      ['dragleave', 'drop'].forEach((type) => els.imageDropzone.addEventListener(type, (event) => {
        event.preventDefault();
        els.imageDropzone.classList.remove('dragging');
      }));
      els.imageDropzone.addEventListener('drop', (event) => {
        const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith('image/'));
        useImageFile(file);
      });
      els.promptImageInput.addEventListener('change', (event) => {
        useImageFile(event.target.files?.[0]);
        event.target.value = '';
      });
      els.replaceImageButton.addEventListener('click', () => els.promptImageInput.click());
      els.removeImageButton.addEventListener('click', removePromptImage);
      els.timerToggle.addEventListener('click', () => setTimerRunning(!state.isRunning));
      els.timerReset.addEventListener('click', resetTimer);
      els.titleInput.addEventListener('input', () => {
        state.title = els.titleInput.value;
        state.questionTitles[state.task] = els.titleInput.value;
        saveEmergencyDraft();
        scheduleSave();
      });
      els.writingArea.addEventListener('input', () => {
        const nextContent = els.writingArea.value;
        state.highlights = adjustHighlightsForEdit(state.highlights, state.content, nextContent);
        state.content = nextContent;
        renderHighlights();
        updateStats();
        if (!state.isRunning && state.elapsed === 0 && countWords(state.content) > 0) setTimerRunning(true);
        saveEmergencyDraft();
        scheduleSave();
      });
      $('saveButton').addEventListener('click', addToHistory);
      els.backupButton.addEventListener('click', exportBackup);
      els.spellcheckButton.addEventListener('click', toggleSpellcheck);
      els.highlightButton.addEventListener('mousedown', (event) => event.preventDefault());
      els.highlightButton.addEventListener('click', toggleHighlight);
      els.printButton.addEventListener('click', printCurrentPractice);
      $('newPracticeButton').addEventListener('click', startNewPractice);
      $('historyButton').addEventListener('click', openHistory);
      $('closeHistoryButton').addEventListener('click', closeHistory);
      els.historyModal.addEventListener('click', (event) => { if (event.target === els.historyModal) closeHistory(); });
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!els.historyModal.hidden) closeHistory();
      });
      els.historyList.addEventListener('click', (event) => {
        const repeatId = event.target.dataset.repeat;
        const restoreId = event.target.dataset.restore;
        const deleteId = event.target.dataset.delete;
        if (repeatId) repeatHistoryItem(repeatId);
        if (restoreId) restoreHistoryItem(restoreId);
        if (deleteId && window.confirm('确定删除这条练习记录吗？')) deleteHistoryItem(deleteId);
      });
      els.writingArea.addEventListener('scroll', syncHighlightLayer, { passive: true });
      if (typeof ResizeObserver === 'function') {
        highlightResizeObserver = new ResizeObserver(syncHighlightLayer);
        highlightResizeObserver.observe(els.writingArea);
      }
      window.addEventListener('beforeprint', preparePrint);
      window.addEventListener('resize', () => {
        resizeQuestionArea();
        syncHighlightLayer();
      });
      window.addEventListener('pagehide', persistNow);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') persistNow();
      });
      document.addEventListener('freeze', persistNow);

      persistenceReady = initializeApplication();
    })();
