export const walkFrontmatterValues = (
    frontmatterValue: unknown,
    visitString: (value: string) => void
): void => {
    if (typeof frontmatterValue === 'string') {
        visitString(frontmatterValue);
        return;
    }

    if (Array.isArray(frontmatterValue)) {
        for (const value of frontmatterValue) {
            walkFrontmatterValues(value, visitString);
        }
        return;
    }

    if (frontmatterValue && typeof frontmatterValue === 'object') {
        for (const value of Object.values(frontmatterValue as Record<string, unknown>)) {
            walkFrontmatterValues(value, visitString);
        }
    }
};
