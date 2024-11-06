import { supabase } from '$lib/server/supabase.js';
import { json } from '@sveltejs/kit';

export async function GET({ request }) {

    const cookies = request.headers.get('cookie');

    if (!cookies) {
        return new Response(JSON.stringify({ error: 'No cookies found' }), { status: 401 });
    }   

    // Parse cookies to extract the access token
    const accessToken = cookies
      .split(';')
      .find((cookie) => cookie.trim().startsWith('access_token='))
      ?.split('=')[1];
  
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'No access token found' }), { status: 401 });
    }
  
    // Get user data from Supabase using the access token
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError) {
        return json({ error: userError.message }, { status: 401 });
    }

    let user = userData.user;

    try {
        const { data: projects, error: projectsError } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (projectsError) {
            return json({ error: projectsError.message }, { status: 500 });
        }

        // If no projects found, return early
        if (!projects || projects.length === 0) {
            return json({ projects: [] }, { status: 200 });
        }

        const projectIds = projects.map(project => project.id);

        // Fetch related categories using the pivot table
        const { data: projectCategories, error: pivotError } = await supabase
            .from('category_project')  
            .select('project_id, category_id')
            .in('project_id', projectIds);

        if (pivotError) {
            return json({ error: pivotError.message }, { status: 500 });
        }

        const categoryIds = [...new Set(projectCategories.map(pc => pc.category_id))];

        // Fetch category details (tags) for the unique category IDs
        const { data: categories, error: categoriesError } = await supabase
            .from('categories') 
            .select('*')
            .in('id', categoryIds);

        if (categoriesError) {
            return json({ error: categoriesError.message }, { status: 500 });
        }

        const categoriesById = categories.reduce((acc, category) => {
            acc[category.id] = category;
            return acc;
        }, {});

        const projectsWithTags = projects.map(project => {
          // Find the category IDs associated with this project
            const tagsForProject = projectCategories
                .filter(pc => pc.project_id === project.id)
                .map(pc => categoriesById[pc.category_id]);

            return {
                ...project,
                tags: tagsForProject.filter(Boolean) // Filter out any null values
            };
        });

      return json({ projects: projectsWithTags }, { status: 200 });

    } catch (error) {
        return json({ error: error.message }, { status: 500 });
    }

}