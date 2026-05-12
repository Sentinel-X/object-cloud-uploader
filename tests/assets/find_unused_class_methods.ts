import { Project } from 'ts-morph';
import path from 'path';

async function findUnusedClassMethods() {
    const project = new Project({
        tsConfigFilePath: path.resolve('tsconfig.json'),
    });

    const sourceFiles = project.getSourceFiles(['src/**/*.ts', 'tests/**/*.ts', 'index.ts']);

    const allReferences = new Map<string, number>();

    for (const sourceFile of sourceFiles) {
        const classes = sourceFile.getClasses();

        for (const cls of classes) {
            const className = cls.getName() ?? 'default';

            for (const method of cls.getMethods()) {
                const methodName = method.getName();
                const key = `${sourceFile.getFilePath()}::${className}.${methodName}`;
                allReferences.set(key, 0);
            }
        }
    }

    for (const sourceFile of sourceFiles) {
        const text = sourceFile.getFullText();

        for (const [key] of allReferences) {
            const [, classMethod] = key.split('::');
            const [, methodName] = classMethod.split('.');

            if (text.includes(`.${methodName}(`) || text.includes(`.${methodName}<`)) {
                allReferences.set(key, (allReferences.get(key) ?? 0) + 1);
            }
        }
    }

    let errors = 0;

    console.log('🔍 Unused Class Methods:');
    for (const [key, count] of allReferences) {
        if (count === 0) {
            console.log('  -', key);
            errors += 1;
        }
    }

    return errors;
}

findUnusedClassMethods().then((files) => {
    if (files > 0) {
        process.exit(1);
    }
    console.log('OK!');
    process.exit(0);
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
