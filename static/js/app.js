/* ── 일정관리 앱 메인 JavaScript ── */

const App = {
    currentYear: 2026,
    currentMonth: 3,
    schedules: [],
    memos: [],
    session: null,
    selectedDate: null,

    async init() {
        const today = new Date();
        this.currentYear = today.getFullYear();
        this.currentMonth = today.getMonth() + 1;

        await this.loadSession();
        this.bindEvents();
        this.loadTheme();
        this.updateMonthLabel();
        await this.renderCalendar();
    },

    async loadSession() {
        const res = await fetch('/api/session');
        this.session = await res.json();
        document.getElementById('user-name').textContent = this.session.name;
        if (this.session.role === 'admin') {
            document.getElementById('admin-menu').style.display = 'block';
        }
        // iCal URL
        const base = window.location.origin;
        const icalInput = document.getElementById('ical-url');
        if (icalInput) {
            icalInput.value = `${base}/api/ical/${this.session.employee_id}.ics`;
        }
    },

    bindEvents() {
        // Navigation
        document.getElementById('btn-prev').addEventListener('click', () => this.prevMonth());
        document.getElementById('btn-next').addEventListener('click', () => this.nextMonth());
        document.getElementById('btn-today').addEventListener('click', () => this.goToday());

        // Sidebar
        document.getElementById('btn-sidebar').addEventListener('click', () => this.toggleSidebar(true));
        document.getElementById('btn-close-sidebar').addEventListener('click', () => this.toggleSidebar(false));
        document.getElementById('sidebar-overlay').addEventListener('click', () => this.toggleSidebar(false));

        // Sidebar nav
        document.querySelectorAll('.sidebar-nav a[data-view]').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchView(a.dataset.view);
                this.toggleSidebar(false);
            });
        });

        // Theme
        document.getElementById('btn-theme').addEventListener('click', () => this.toggleTheme());

        // Search
        document.getElementById('btn-search').addEventListener('click', () => this.doSearch());
        document.getElementById('search-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.doSearch();
        });
        document.getElementById('btn-close-search').addEventListener('click', () => {
            document.getElementById('search-modal').style.display = 'none';
        });

        // Day modal
        document.getElementById('btn-close-modal').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeModal();
        });
        document.getElementById('btn-edit-schedule').addEventListener('click', () => this.showEditForm());
        document.getElementById('btn-cancel-edit').addEventListener('click', () => this.hideEditForm());
        document.getElementById('btn-save-schedule').addEventListener('click', () => this.saveSchedule());
        document.getElementById('btn-delete-schedule').addEventListener('click', () => this.deleteSchedule());
        document.getElementById('btn-save-memo').addEventListener('click', () => this.saveMemo());

        // Admin
        document.getElementById('btn-add-user')?.addEventListener('click', () => {
            document.getElementById('add-user-modal').style.display = 'flex';
        });
        document.querySelectorAll('.btn-close-add-user').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('add-user-modal').style.display = 'none';
            });
        });
        document.getElementById('btn-confirm-add-user')?.addEventListener('click', () => this.addUser());

        // Excel import
        document.getElementById('import-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.importExcel();
        });
        // Drop zone
        const dropZone = document.getElementById('drop-zone');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--accent)';
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.style.borderColor = '';
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = '';
                const files = e.dataTransfer.files;
                if (files.length) {
                    document.getElementById('excel-file').files = files;
                    dropZone.querySelector('p').textContent = files[0].name;
                }
            });
            document.getElementById('excel-file').addEventListener('change', (e) => {
                if (e.target.files.length) {
                    dropZone.querySelector('p').textContent = e.target.files[0].name;
                }
            });
        }

        // Copy URL
        document.getElementById('btn-copy-url')?.addEventListener('click', () => {
            const input = document.getElementById('ical-url');
            input.select();
            navigator.clipboard.writeText(input.value).then(() => {
                this.toast('URL이 복사되었습니다');
            });
        });

        // Add memo button
        document.getElementById('btn-add-memo')?.addEventListener('click', () => {
            const today = new Date().toISOString().slice(0, 10);
            this.selectedDate = today;
            this.openModal(today);
        });
    },

    /* ── Theme ── */
    loadTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        if (theme === 'dark') document.body.classList.add('dark');
        this.updateThemeIcon();
    },
    toggleTheme() {
        document.body.classList.toggle('dark');
        const isDark = document.body.classList.contains('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        this.updateThemeIcon();
    },
    updateThemeIcon() {
        const btn = document.getElementById('btn-theme');
        btn.innerHTML = document.body.classList.contains('dark') ? '&#9728;' : '&#9790;';
    },

    /* ── Sidebar ── */
    toggleSidebar(open) {
        document.getElementById('sidebar').classList.toggle('open', open);
        document.getElementById('sidebar-overlay').classList.toggle('show', open);
    },

    /* ── View Switch ── */
    switchView(view) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
        const viewEl = document.getElementById(`view-${view}`);
        if (viewEl) viewEl.classList.add('active');
        const navLink = document.querySelector(`.sidebar-nav a[data-view="${view}"]`);
        if (navLink) navLink.classList.add('active');

        if (view === 'my-schedule') this.loadMySchedule();
        if (view === 'memo') this.loadMemos();
        if (view === 'admin-users') this.loadUsers();
    },

    /* ── Calendar Rendering ── */
    updateMonthLabel() {
        document.getElementById('current-month-label').textContent =
            `${this.currentYear}년 ${this.currentMonth}월`;
    },

    async renderCalendar() {
        this.updateMonthLabel();
        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';

        // Fetch schedules and memos for this month
        const start = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-01`;
        const endMonth = this.currentMonth === 12 ? 1 : this.currentMonth + 1;
        const endYear = this.currentMonth === 12 ? this.currentYear + 1 : this.currentYear;
        const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

        const [schedRes, memoRes] = await Promise.all([
            fetch(`/api/schedules?start=${start}&end=${end}`),
            fetch(`/api/memos?start=${start}&end=${end}&employee_id=${this.session.employee_id}`)
        ]);
        this.schedules = await schedRes.json();
        this.memos = await memoRes.json();

        // Build schedule/memo lookup
        const schedMap = {};
        this.schedules.forEach(s => {
            if (!schedMap[s.date]) schedMap[s.date] = [];
            schedMap[s.date].push(s);
        });
        const memoMap = {};
        this.memos.forEach(m => {
            memoMap[m.date] = true;
        });

        const firstDay = new Date(this.currentYear, this.currentMonth - 1, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth, 0);
        const startDow = firstDay.getDay();
        const totalDays = lastDay.getDate();
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // Previous month fill
        const prevMonthLast = new Date(this.currentYear, this.currentMonth - 1, 0);
        for (let i = startDow - 1; i >= 0; i--) {
            const d = prevMonthLast.getDate() - i;
            const cell = this.createCell(d, true, null, null);
            grid.appendChild(cell);
        }

        // Current month
        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dow = new Date(this.currentYear, this.currentMonth - 1, d).getDay();
            const isToday = dateStr === todayStr;
            const scheds = schedMap[dateStr] || [];
            const hasMemo = !!memoMap[dateStr];
            const cell = this.createCell(d, false, scheds, hasMemo, dow, isToday, dateStr);
            grid.appendChild(cell);
        }

        // Next month fill
        const totalCells = startDow + totalDays;
        const remaining = (7 - (totalCells % 7)) % 7;
        for (let d = 1; d <= remaining; d++) {
            const cell = this.createCell(d, true, null, null);
            grid.appendChild(cell);
        }
    },

    createCell(day, otherMonth, schedules, hasMemo, dow, isToday, dateStr) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        if (otherMonth) cell.classList.add('other-month');
        if (isToday) cell.classList.add('today');

        const dateLabel = document.createElement('div');
        dateLabel.className = 'cell-date';
        dateLabel.textContent = day;
        if (dow === 0) dateLabel.classList.add('sun');
        if (dow === 6) dateLabel.classList.add('sat');
        cell.appendChild(dateLabel);

        if (schedules && schedules.length > 0) {
            // Show current user's schedule primarily
            const mySchedule = schedules.find(s => s.employee_id === this.session.employee_id) || schedules[0];
            const badge = document.createElement('div');
            badge.className = `shift-badge ${this.getShiftClass(mySchedule.shift_type)}`;
            badge.textContent = mySchedule.shift_type;
            cell.appendChild(badge);

            if (mySchedule.detail) {
                const detail = document.createElement('div');
                detail.className = 'cell-detail';
                detail.textContent = mySchedule.detail;
                cell.appendChild(detail);
            }
        }

        if (hasMemo) {
            const dot = document.createElement('div');
            dot.className = 'cell-memo-dot';
            cell.appendChild(dot);
        }

        if (!otherMonth && dateStr) {
            cell.addEventListener('click', () => this.openModal(dateStr));
        }

        return cell;
    },

    getShiftClass(type) {
        if (!type) return 'etc';
        const t = type.trim();
        if (t === 'D') return 'D';
        if (t === 'S') return 'S';
        if (t === 'G') return 'G';
        if (t === '휴' || t === '월중') return 'off';
        if (t === 'O') return 'O';
        return 'etc';
    },

    /* ── Navigation ── */
    prevMonth() {
        this.currentMonth--;
        if (this.currentMonth < 1) { this.currentMonth = 12; this.currentYear--; }
        this.renderCalendar();
    },
    nextMonth() {
        this.currentMonth++;
        if (this.currentMonth > 12) { this.currentMonth = 1; this.currentYear++; }
        this.renderCalendar();
    },
    goToday() {
        const today = new Date();
        this.currentYear = today.getFullYear();
        this.currentMonth = today.getMonth() + 1;
        this.renderCalendar();
    },

    /* ── Day Modal ── */
    async openModal(dateStr) {
        this.selectedDate = dateStr;
        const d = new Date(dateStr);
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        document.getElementById('modal-date-title').textContent =
            `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;

        // Load schedule for this date
        const schedRes = await fetch(`/api/schedules?start=${dateStr}&end=${this.nextDate(dateStr)}&employee_id=${this.session.employee_id}`);
        const scheds = await schedRes.json();
        const infoDiv = document.getElementById('modal-schedule-info');

        if (scheds.length > 0) {
            const s = scheds[0];
            infoDiv.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px">
                    <span class="shift-badge ${this.getShiftClass(s.shift_type)}" style="font-size:16px;padding:4px 14px">${s.shift_type}</span>
                    <span style="color:var(--text-secondary)">${s.detail || ''}</span>
                </div>`;
            document.getElementById('btn-delete-schedule').style.display = 'inline-block';
            document.getElementById('btn-delete-schedule').dataset.id = s.id;
        } else {
            infoDiv.innerHTML = '<p style="color:var(--text-muted)">등록된 일정이 없습니다</p>';
            document.getElementById('btn-delete-schedule').style.display = 'none';
        }

        // Load memos for this date
        const memoRes = await fetch(`/api/memos?date=${dateStr}&employee_id=${this.session.employee_id}`);
        const memos = await memoRes.json();
        const memosDiv = document.getElementById('modal-memos');
        if (memos.length > 0) {
            memosDiv.innerHTML = memos.map(m => `
                <div class="memo-item" style="margin-bottom:8px">
                    <div class="memo-content">${this.escapeHtml(m.content)}</div>
                    <div class="memo-actions">
                        <button class="btn-small btn-danger" onclick="App.deleteMemo(${m.id})">삭제</button>
                    </div>
                </div>
            `).join('');
        } else {
            memosDiv.innerHTML = '';
        }

        document.getElementById('modal-memo-input').value = '';
        this.hideEditForm();
        document.getElementById('modal-overlay').classList.add('show');
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('show');
    },

    nextDate(dateStr) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
    },

    /* ── Schedule CRUD ── */
    showEditForm() {
        document.getElementById('schedule-edit-form').style.display = 'flex';
        // Pre-fill with current
        const badge = document.querySelector('#modal-schedule-info .shift-badge');
        if (badge) {
            document.getElementById('edit-shift-type').value = badge.textContent.trim();
        }
    },
    hideEditForm() {
        document.getElementById('schedule-edit-form').style.display = 'none';
    },

    async saveSchedule() {
        const shiftType = document.getElementById('edit-shift-type').value;
        const detail = document.getElementById('edit-detail').value;
        if (!shiftType) {
            this.toast('근무 타입을 선택하세요');
            return;
        }
        await fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: this.selectedDate,
                shift_type: shiftType,
                detail: detail,
                employee_id: this.session.employee_id,
            })
        });
        this.toast('일정이 저장되었습니다');
        this.hideEditForm();
        await this.renderCalendar();
        this.openModal(this.selectedDate);
    },

    async deleteSchedule() {
        const id = document.getElementById('btn-delete-schedule').dataset.id;
        if (!id || !confirm('이 일정을 삭제하시겠습니까?')) return;
        await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
        this.toast('일정이 삭제되었습니다');
        await this.renderCalendar();
        this.openModal(this.selectedDate);
    },

    /* ── Memo CRUD ── */
    async saveMemo() {
        const content = document.getElementById('modal-memo-input').value.trim();
        if (!content) return;
        await fetch('/api/memos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: this.selectedDate,
                content: content,
                employee_id: this.session.employee_id,
            })
        });
        this.toast('메모가 저장되었습니다');
        await this.renderCalendar();
        this.openModal(this.selectedDate);
    },

    async deleteMemo(id) {
        if (!confirm('이 메모를 삭제하시겠습니까?')) return;
        await fetch(`/api/memos/${id}`, { method: 'DELETE' });
        this.toast('메모가 삭제되었습니다');
        await this.renderCalendar();
        this.openModal(this.selectedDate);
    },

    /* ── My Schedule List ── */
    async loadMySchedule() {
        const start = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-01`;
        const endMonth = this.currentMonth === 12 ? 1 : this.currentMonth + 1;
        const endYear = this.currentMonth === 12 ? this.currentYear + 1 : this.currentYear;
        const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

        const res = await fetch(`/api/schedules?start=${start}&end=${end}&employee_id=${this.session.employee_id}`);
        const scheds = await res.json();
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        const list = document.getElementById('schedule-list');

        if (scheds.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">이번 달 일정이 없습니다</p>';
            return;
        }

        list.innerHTML = scheds.sort((a, b) => a.date.localeCompare(b.date)).map(s => {
            const d = new Date(s.date);
            return `
            <div class="schedule-item" onclick="App.switchView('calendar'); App.openModal('${s.date}')">
                <div class="schedule-date">
                    <div class="day">${d.getDate()}</div>
                    <div class="weekday">${weekdays[d.getDay()]}</div>
                </div>
                <span class="shift-badge ${this.getShiftClass(s.shift_type)}" style="font-size:14px;padding:4px 14px">${s.shift_type}</span>
                <span style="color:var(--text-secondary);font-size:14px">${s.detail || ''}</span>
            </div>`;
        }).join('');
    },

    /* ── Memos List ── */
    async loadMemos() {
        const res = await fetch(`/api/memos?employee_id=${this.session.employee_id}`);
        const memos = await res.json();
        const list = document.getElementById('memo-list');

        if (memos.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">메모가 없습니다</p>';
            return;
        }

        list.innerHTML = memos.map(m => `
            <div class="memo-item">
                <div class="memo-date">${m.date}</div>
                <div class="memo-content">${this.escapeHtml(m.content)}</div>
                <div class="memo-actions">
                    <button class="btn-small btn-danger" onclick="App.deleteMemo(${m.id})">삭제</button>
                </div>
            </div>
        `).join('');
    },

    /* ── Search ── */
    async doSearch() {
        const q = document.getElementById('search-input').value.trim();
        if (!q) return;
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const results = await res.json();
        const container = document.getElementById('search-results');

        if (results.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px">검색 결과가 없습니다</p>';
        } else {
            container.innerHTML = results.map(r => {
                if (r.type === 'schedule') {
                    return `
                    <div class="schedule-item" style="cursor:pointer" onclick="document.getElementById('search-modal').style.display='none'; App.switchView('calendar'); App.openModal('${r.date}')">
                        <div class="schedule-date"><div class="day">${r.date.slice(8)}</div><div class="weekday">${r.date.slice(5, 7)}월</div></div>
                        <span class="shift-badge ${this.getShiftClass(r.shift_type)}">${r.shift_type}</span>
                        <span style="font-size:13px">${r.detail || ''} ${r.name ? '(' + r.name + ')' : ''}</span>
                    </div>`;
                } else {
                    return `
                    <div class="memo-item">
                        <div class="memo-date">${r.date} ${r.name ? '(' + r.name + ')' : ''}</div>
                        <div class="memo-content">${this.escapeHtml(r.content)}</div>
                    </div>`;
                }
            }).join('');
        }
        document.getElementById('search-modal').style.display = 'flex';
    },

    /* ── Admin: Users ── */
    async loadUsers() {
        const res = await fetch('/api/users');
        const users = await res.json();
        const tbody = document.querySelector('#user-table tbody');
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${u.employee_id}</td>
                <td>${u.name}</td>
                <td>${u.team || ''}</td>
                <td>
                    ${u.employee_id !== 'admin' ? `
                    <button class="btn-small btn-danger" onclick="App.deleteUser('${u.employee_id}')">삭제</button>
                    <button class="btn-small btn-primary" onclick="App.resetPassword('${u.employee_id}')">비밀번호 초기화</button>
                    ` : '<span style="color:var(--text-muted)">관리자</span>'}
                </td>
            </tr>
        `).join('');
    },

    async addUser() {
        const empId = document.getElementById('new-emp-id').value.trim();
        const name = document.getElementById('new-emp-name').value.trim();
        const team = document.getElementById('new-emp-team').value.trim();
        if (!empId || !name) {
            this.toast('사번과 이름을 입력하세요');
            return;
        }
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_id: empId, name, team })
        });
        const data = await res.json();
        if (data.error) {
            this.toast(data.error);
        } else {
            this.toast('인원이 추가되었습니다');
            document.getElementById('add-user-modal').style.display = 'none';
            document.getElementById('new-emp-id').value = '';
            document.getElementById('new-emp-name').value = '';
            document.getElementById('new-emp-team').value = '';
            this.loadUsers();
        }
    },

    async deleteUser(empId) {
        if (!confirm(`${empId} 사용자를 삭제하시겠습니까? 관련 일정과 메모도 모두 삭제됩니다.`)) return;
        await fetch(`/api/users/${empId}`, { method: 'DELETE' });
        this.toast('삭제되었습니다');
        this.loadUsers();
    },

    async resetPassword(empId) {
        if (!confirm(`${empId}의 비밀번호를 사번으로 초기화하시겠습니까?`)) return;
        await fetch(`/api/users/${empId}/reset-password`, { method: 'POST' });
        this.toast('비밀번호가 초기화되었습니다');
    },

    /* ── Excel Import ── */
    async importExcel() {
        const fileInput = document.getElementById('excel-file');
        if (!fileInput.files.length) {
            this.toast('파일을 선택하세요');
            return;
        }
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        const btn = document.getElementById('btn-import');
        btn.textContent = '가져오는 중...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/import-excel', { method: 'POST', body: formData });
            const data = await res.json();
            const resultDiv = document.getElementById('import-result');
            if (data.error) {
                resultDiv.className = 'import-result error';
                resultDiv.textContent = `오류: ${data.error}`;
            } else {
                resultDiv.className = 'import-result success';
                resultDiv.textContent = `완료! 사용자 ${data.users}명, 일정 ${data.schedules}건이 등록되었습니다.`;
                await this.renderCalendar();
            }
        } catch (e) {
            this.toast('가져오기 실패');
        }
        btn.textContent = '가져오기';
        btn.disabled = false;
    },

    /* ── Utils ── */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    toast(msg) {
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
