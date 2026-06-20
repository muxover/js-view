let lastActivity = Date.now();

export function touch(): void {
	lastActivity = Date.now();
}

export function idleMs(): number {
	return Date.now() - lastActivity;
}
