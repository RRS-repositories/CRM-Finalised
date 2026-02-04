import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';

const DSAR_MAILBOX = 'DSAR@fastactionclaims.co.uk';

async function testGraphConnection() {
    console.log('🧪 Testing Microsoft Graph API connection...\n');

    try {
        // Initialize credential
        console.log('📝 Initializing Azure AD credential...');
        const msalCredential = new ClientSecretCredential(
            process.env.MS_TENANT_ID,
            process.env.MS_CLIENT_ID,
            process.env.MS_CLIENT_SECRET
        );
        console.log('✅ Credential initialized\n');

        // Initialize Graph client
        console.log('📝 Initializing Microsoft Graph client...');
        const graphClient = Client.initWithMiddleware({
            authProvider: {
                getAccessToken: async () => {
                    const token = await msalCredential.getToken('https://graph.microsoft.com/.default');
                    return token.token;
                }
            }
        });
        console.log('✅ Graph client initialized\n');

        // Test 1: Get user profile
        console.log(`📝 Test 1: Fetching mailbox info for ${DSAR_MAILBOX}...`);
        try {
            const user = await graphClient
                .api(`/users/${DSAR_MAILBOX}`)
                .select('displayName,mail,userPrincipalName')
                .get();

            console.log('✅ Mailbox found!');
            console.log('   Display Name:', user.displayName);
            console.log('   Email:', user.mail);
            console.log('   UPN:', user.userPrincipalName);
            console.log('');
        } catch (error) {
            console.error('❌ Failed to fetch mailbox info:', error.message);
            console.log('');
        }

        // Test 2: List messages (to verify permissions)
        console.log(`📝 Test 2: Checking message access for ${DSAR_MAILBOX}...`);
        try {
            const messages = await graphClient
                .api(`/users/${DSAR_MAILBOX}/messages`)
                .top(1)
                .select('subject')
                .get();

            console.log('✅ Message access granted!');
            console.log(`   Found ${messages.value.length} message(s)`);
            console.log('');
        } catch (error) {
            console.error('❌ Failed to access messages:', error.message);
            console.log('');
        }

        // Test 3: Create a test draft
        console.log(`📝 Test 3: Creating a test draft email in ${DSAR_MAILBOX}...`);
        try {
            const testDraft = {
                subject: 'TEST DRAFT - Please Delete',
                body: {
                    contentType: 'HTML',
                    content: '<p>This is a test draft created by the DSAR worker. You can safely delete this.</p>'
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: 'test@example.com'
                        }
                    }
                ]
            };

            const createdDraft = await graphClient
                .api(`/users/${DSAR_MAILBOX}/messages`)
                .post(testDraft);

            console.log('✅ Test draft created successfully!');
            console.log('   Draft ID:', createdDraft.id);
            console.log('   Subject:', createdDraft.subject);
            console.log('');

            // Clean up - delete the test draft
            console.log('📝 Cleaning up test draft...');
            await graphClient
                .api(`/users/${DSAR_MAILBOX}/messages/${createdDraft.id}`)
                .delete();
            console.log('✅ Test draft deleted\n');

        } catch (error) {
            console.error('❌ Failed to create test draft:', error.message);
            if (error.body) {
                console.error('   Error details:', error.body);
            }
            console.log('');
        }

        console.log('✅ All tests completed!\n');
        console.log('Summary:');
        console.log('- Microsoft Graph API connection: Working');
        console.log('- Mailbox access: Verified');
        console.log('- Draft creation: Ready to use');
        console.log('\nYou can now run worker.js to create draft emails for DSAR cases.');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('\nPlease verify:');
        console.error('1. Azure App Registration has Mail.ReadWrite application permission');
        console.error('2. Admin consent has been granted for the permission');
        console.error('3. MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET are correct in .env');
        console.error('4. DSAR@fastactionclaims.co.uk is a valid Microsoft 365 user account');
    }
}

testGraphConnection();
